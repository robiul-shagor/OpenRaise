// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {OpenRaise} from "../../src/OpenRaise.sol";
import {params} from "../utils/Params.sol";
import {MockERC20} from "../../src/MockERC20.sol";

/// @dev Drives random create/contribute/warp/withdraw/refund sequences and tracks ghost totals.
contract Handler is Test {
    OpenRaise public immutable raise;
    MockERC20 public immutable token;

    address[] public actors;
    uint256[] public ids;

    // Ghost accounting per asset (0 = ETH, 1 = token)
    uint256[2] public ghostIn;
    uint256[2] public ghostOut;
    mapping(uint256 id => uint256) public ghostRefunded;
    mapping(uint256 id => bool) public ghostWithdrawn;
    mapping(uint256 id => bool) public ghostCancelled;

    constructor(OpenRaise r, MockERC20 t) {
        raise = r;
        token = t;
        for (uint256 i; i < 4; ++i) {
            address a = makeAddr(string(abi.encodePacked("actor", vm.toString(i))));
            actors.push(a);
            vm.deal(a, 1_000_000 ether);
            t.mint(a, type(uint128).max);
            vm.prank(a);
            t.approve(address(r), type(uint256).max);
        }
    }

    function idsLength() external view returns (uint256) {
        return ids.length;
    }

    function actorsLength() external view returns (uint256) {
        return actors.length;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _id(uint256 seed) internal view returns (uint256) {
        return ids[seed % ids.length];
    }

    function create(uint256 actorSeed, bool useToken, uint256 goal, uint256 duration) external {
        goal = bound(goal, 1, 100 ether);
        duration = bound(duration, raise.MIN_DURATION(), 30 days);
        vm.prank(_actor(actorSeed));
        uint256 id = raise.createCampaign(
            params(
                useToken ? address(token) : address(0), goal, uint64(block.timestamp + duration), "inv", ""
            )
        );
        ids.push(id);
    }

    function contribute(uint256 actorSeed, uint256 idSeed, uint256 amount) external {
        if (ids.length == 0) return;
        uint256 id = _id(idSeed);
        if (raise.statusOf(id) != OpenRaise.Status.Active) return;
        amount = bound(amount, 1, 20 ether);
        address a = _actor(actorSeed);
        bool isEth = raise.getCampaign(id).asset == address(0);
        vm.prank(a);
        raise.contribute{value: isEth ? amount : 0}(id, amount);
        ghostIn[isEth ? 0 : 1] += amount;
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 10 days));
    }

    function withdraw(uint256 idSeed) external {
        if (ids.length == 0) return;
        uint256 id = _id(idSeed);
        if (raise.statusOf(id) != OpenRaise.Status.Successful) return;
        OpenRaise.CampaignView memory c = raise.getCampaign(id);
        vm.prank(c.owner);
        raise.withdraw(id);
        ghostOut[c.asset == address(0) ? 0 : 1] += c.raised;
        ghostWithdrawn[id] = true;
    }

    function cancel(uint256 idSeed, bool asAdmin) external {
        if (ids.length == 0) return;
        uint256 id = _id(idSeed);
        if (raise.statusOf(id) != OpenRaise.Status.Active) return;
        vm.prank(asAdmin ? raise.owner() : raise.getCampaign(id).owner);
        raise.cancelCampaign(id);
        ghostCancelled[id] = true;
    }

    function update(uint256 idSeed, uint256 n) external {
        if (ids.length == 0) return;
        uint256 id = _id(idSeed);
        if (raise.statusOf(id) != OpenRaise.Status.Active) return;
        vm.prank(raise.getCampaign(id).owner);
        raise.updateCampaign(
            id,
            OpenRaise.CampaignMetadata({
                title: string.concat("edited ", vm.toString(n % 1000)),
                description: "",
                creatorName: "inv",
                category: "Tooling",
                imageURI: ""
            })
        );
    }

    function refund(uint256 actorSeed, uint256 idSeed) external {
        if (ids.length == 0) return;
        uint256 id = _id(idSeed);
        OpenRaise.Status st = raise.statusOf(id);
        if (st != OpenRaise.Status.Failed && st != OpenRaise.Status.Cancelled) return;
        address a = _actor(actorSeed);
        uint256 owed = raise.contributionOf(id, a);
        if (owed == 0) return;
        vm.prank(a);
        raise.refund(id);
        bool isEth = raise.getCampaign(id).asset == address(0);
        ghostOut[isEth ? 0 : 1] += owed;
        ghostRefunded[id] += owed;
    }
}

contract OpenRaiseInvariantTest is Test {
    OpenRaise raise;
    MockERC20 token;
    Handler handler;

    function setUp() public {
        raise = new OpenRaise(address(this));
        token = new MockERC20("Mock USD", "mUSD", 6);
        raise.setAssetAllowed(address(token), true);
        handler = new Handler(raise, token);
        targetContract(address(handler));
    }

    /// Contract always holds exactly what came in minus what went out — no leakage, no stuck surplus.
    function invariant_balancesMatchGhostAccounting() public view {
        assertEq(address(raise).balance, handler.ghostIn(0) - handler.ghostOut(0));
        assertEq(token.balanceOf(address(raise)), handler.ghostIn(1) - handler.ghostOut(1));
    }

    /// Per campaign: refunds never exceed raised; outstanding contributions equal raised - refunded
    /// (until withdrawal); withdrawn and refunded are mutually exclusive; cancelled never withdraws.
    function invariant_perCampaignAccounting() public view {
        uint256 n = handler.idsLength();
        uint256 m = handler.actorsLength();
        for (uint256 i; i < n; ++i) {
            uint256 id = handler.ids(i);
            OpenRaise.CampaignView memory c = raise.getCampaign(id);
            assertLe(c.refunded, c.raised);
            assertEq(c.refunded, handler.ghostRefunded(id));
            if (c.status == OpenRaise.Status.Withdrawn) assertEq(c.refunded, 0);
            // Cancelled is terminal and exclusive with withdrawal; a cancelled campaign never pays the owner.
            assertEq(c.status == OpenRaise.Status.Cancelled, handler.ghostCancelled(id));
            if (handler.ghostCancelled(id)) assertFalse(handler.ghostWithdrawn(id));

            uint256 outstanding;
            for (uint256 j; j < m; ++j) {
                outstanding += raise.contributionOf(id, handler.actors(j));
            }
            assertEq(outstanding, c.raised - c.refunded);
        }
    }
}
