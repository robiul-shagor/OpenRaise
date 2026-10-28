// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {OpenRaise} from "../src/OpenRaise.sol";
import {params} from "./utils/Params.sol";
import {MockERC20} from "../src/MockERC20.sol";

/// @dev Receiver that tries to re-enter on ETH receipt.
contract Reenterer {
    OpenRaise public immutable raise;
    uint256 public targetId;
    bool public attackRefund;
    bool public reentered;

    constructor(OpenRaise r) {
        raise = r;
    }

    function create(uint256 goal, uint64 deadline) external returns (uint256) {
        return raise.createCampaign(params(address(0), goal, deadline, "evil", ""));
    }

    function contribute(uint256 id) external payable {
        raise.contribute{value: msg.value}(id, msg.value);
    }

    function doRefund(uint256 id) external {
        targetId = id;
        attackRefund = true;
        raise.refund(id);
    }

    function doWithdraw(uint256 id) external {
        targetId = id;
        attackRefund = false;
        raise.withdraw(id);
    }

    receive() external payable {
        if (reentered) return;
        reentered = true;
        if (attackRefund) raise.refund(targetId);
        else raise.withdraw(targetId);
    }
}

contract RejectEth {
    function create(OpenRaise r, uint64 deadline) external returns (uint256) {
        return r.createCampaign(params(address(0), 1 ether, deadline, "rejecter", ""));
    }

    function withdraw(OpenRaise r, uint256 id) external {
        r.withdraw(id);
    }
}

contract OpenRaiseTest is Test {
    OpenRaise raise;
    MockERC20 token;

    address admin = makeAddr("admin");
    address owner = makeAddr("owner");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant GOAL = 10 ether;
    uint64 deadline;

    function setUp() public {
        raise = new OpenRaise(admin);
        token = new MockERC20("Mock USD", "mUSD", 6);
        vm.prank(admin);
        raise.setAssetAllowed(address(token), true);

        deadline = uint64(block.timestamp + 7 days);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        token.mint(alice, 1_000_000e6);
        token.mint(bob, 1_000_000e6);
        vm.prank(alice);
        token.approve(address(raise), type(uint256).max);
        vm.prank(bob);
        token.approve(address(raise), type(uint256).max);
    }

    function _createEth() internal returns (uint256 id) {
        vm.prank(owner);
        id = raise.createCampaign(params(address(0), GOAL, deadline, "Community garden", "Seeds and soil"));
    }

    function _createToken(uint256 goal) internal returns (uint256 id) {
        vm.prank(owner);
        id = raise.createCampaign(params(address(token), goal, deadline, "Token raise", ""));
    }

    function _give(address who, uint256 id, uint256 amount) internal {
        vm.prank(who);
        raise.contribute{value: amount}(id, amount);
    }

    // ------------------------------------------------------------------
    // Creation & validation
    // ------------------------------------------------------------------

    function test_create_storesFieldsAndEmits() public {
        vm.expectEmit(true, true, true, true);
        emit OpenRaise.CampaignCreated(1, owner, address(0), GOAL, deadline, "Community garden", "Tooling");
        uint256 id = _createEth();

        OpenRaise.CampaignView memory v = raise.getCampaign(id);
        assertEq(id, 1);
        assertEq(raise.campaignCount(), 1);
        assertEq(v.owner, owner);
        assertEq(v.asset, address(0));
        assertEq(v.goal, GOAL);
        assertEq(v.deadline, deadline);
        assertEq(v.raised, 0);
        assertEq(uint8(v.status), uint8(OpenRaise.Status.Active));
        assertEq(v.title, "Community garden");
        assertEq(v.description, "Seeds and soil");
        assertEq(v.creatorName, "Test Team");
        assertEq(v.category, "Tooling");
    }

    function test_create_revertsOnZeroGoal() public {
        vm.expectRevert(OpenRaise.InvalidGoal.selector);
        raise.createCampaign(params(address(0), 0, deadline, "t", ""));
    }

    function test_create_revertsOnDeadlineTooSoon() public {
        uint64 tooSoon = uint64(block.timestamp + raise.MIN_DURATION() - 1);
        vm.expectRevert(OpenRaise.InvalidDeadline.selector);
        raise.createCampaign(params(address(0), 1, tooSoon, "t", ""));
    }

    function test_create_acceptsMinAndMaxDuration() public {
        raise.createCampaign(params(address(0), 1, uint64(block.timestamp + raise.MIN_DURATION()), "t", ""));
        raise.createCampaign(params(address(0), 1, uint64(block.timestamp + raise.MAX_DURATION()), "t", ""));
        assertEq(raise.campaignCount(), 2);
    }

    function test_create_revertsOnDeadlineTooFar() public {
        uint64 tooFar = uint64(block.timestamp + raise.MAX_DURATION() + 1);
        vm.expectRevert(OpenRaise.InvalidDeadline.selector);
        raise.createCampaign(params(address(0), 1, tooFar, "t", ""));
    }

    function test_create_revertsOnPastDeadline() public {
        vm.warp(1000);
        vm.expectRevert(OpenRaise.InvalidDeadline.selector);
        raise.createCampaign(params(address(0), 1, 999, "t", ""));
    }

    function test_create_revertsOnEmptyOrLongTitle() public {
        vm.expectRevert(OpenRaise.InvalidTitle.selector);
        raise.createCampaign(params(address(0), 1, deadline, "", ""));

        string memory longTitle = string(new bytes(raise.MAX_TITLE_BYTES() + 1));
        vm.expectRevert(OpenRaise.InvalidTitle.selector);
        raise.createCampaign(params(address(0), 1, deadline, longTitle, ""));
    }

    function test_create_revertsOnLongDescription() public {
        string memory longDesc = string(new bytes(raise.MAX_DESCRIPTION_BYTES() + 1));
        vm.expectRevert(OpenRaise.DescriptionTooLong.selector);
        raise.createCampaign(params(address(0), 1, deadline, "t", longDesc));
    }

    function test_create_revertsOnEmptyOrLongCreatorName() public {
        OpenRaise.CampaignParams memory p = params(address(0), 1, deadline, "t", "");
        p.creatorName = "";
        vm.expectRevert(OpenRaise.InvalidCreatorName.selector);
        raise.createCampaign(p);

        p.creatorName = string(new bytes(raise.MAX_CREATOR_NAME_BYTES() + 1));
        vm.expectRevert(OpenRaise.InvalidCreatorName.selector);
        raise.createCampaign(p);

        p.creatorName = string(new bytes(raise.MAX_CREATOR_NAME_BYTES()));
        raise.createCampaign(p);
    }

    function test_create_revertsOnEmptyOrLongCategory() public {
        OpenRaise.CampaignParams memory p = params(address(0), 1, deadline, "t", "");
        p.category = "";
        vm.expectRevert(OpenRaise.InvalidCategory.selector);
        raise.createCampaign(p);

        p.category = string(new bytes(raise.MAX_CATEGORY_BYTES() + 1));
        vm.expectRevert(OpenRaise.InvalidCategory.selector);
        raise.createCampaign(p);

        p.category = string(new bytes(raise.MAX_CATEGORY_BYTES()));
        raise.createCampaign(p);
    }

    function test_create_revertsOnUnallowedAsset() public {
        address other = makeAddr("otherToken");
        vm.expectRevert(abi.encodeWithSelector(OpenRaise.AssetNotAllowed.selector, other));
        raise.createCampaign(params(other, 1, deadline, "t", ""));
    }

    function test_setAssetAllowed_onlyOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        raise.setAssetAllowed(address(1), true);
    }

    function test_setAssetAllowed_cannotToggleNative() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(OpenRaise.AssetNotAllowed.selector, address(0)));
        raise.setAssetAllowed(address(0), false);
    }

    function test_unknownCampaignReverts() public {
        vm.expectRevert(abi.encodeWithSelector(OpenRaise.CampaignNotFound.selector, 42));
        raise.getCampaign(42);
        vm.expectRevert(abi.encodeWithSelector(OpenRaise.CampaignNotFound.selector, 42));
        raise.contribute(42, 1);
    }

    // ------------------------------------------------------------------
    // Contributions & deadline boundary
    // ------------------------------------------------------------------

    function test_contribute_beforeDeadline() public {
        uint256 id = _createEth();
        vm.expectEmit(true, true, false, true);
        emit OpenRaise.Contributed(id, alice, 1 ether, 1 ether);
        _give(alice, id, 1 ether);
        _give(alice, id, 2 ether);
        _give(bob, id, 3 ether);

        assertEq(raise.contributionOf(id, alice), 3 ether);
        assertEq(raise.contributionOf(id, bob), 3 ether);
        assertEq(raise.getCampaign(id).raised, 6 ether);
        assertEq(address(raise).balance, 6 ether);
    }

    function test_contribute_oneSecondBeforeDeadline() public {
        uint256 id = _createEth();
        vm.warp(deadline - 1);
        _give(alice, id, 1 ether);
        assertEq(raise.getCampaign(id).raised, 1 ether);
    }

    function test_contribute_atDeadlineReverts() public {
        uint256 id = _createEth();
        vm.warp(deadline);
        vm.expectRevert(abi.encodeWithSelector(OpenRaise.InvalidStatus.selector, OpenRaise.Status.Failed));
        _give(alice, id, 1 ether);
    }

    function test_contribute_afterDeadlineReverts() public {
        uint256 id = _createEth();
        _give(alice, id, GOAL);
        vm.warp(deadline + 1 days);
        vm.expectRevert(abi.encodeWithSelector(OpenRaise.InvalidStatus.selector, OpenRaise.Status.Successful));
        _give(bob, id, 1 ether);
    }

    function test_contribute_zeroReverts() public {
        uint256 id = _createEth();
        vm.expectRevert(OpenRaise.InvalidAmount.selector);
        _give(alice, id, 0);
    }

    function test_contribute_ethValueMismatchReverts() public {
        uint256 id = _createEth();
        vm.prank(alice);
        vm.expectRevert(OpenRaise.InvalidAmount.selector);
        raise.contribute{value: 1 ether}(id, 2 ether);
    }

    function test_contribute_tokenWithEthReverts() public {
        uint256 id = _createToken(100e6);
        vm.prank(alice);
        vm.expectRevert(OpenRaise.InvalidAmount.selector);
        raise.contribute{value: 1}(id, 1e6);
    }

    function test_contribute_overGoalAllowedWhileActive() public {
        uint256 id = _createEth();
        _give(alice, id, GOAL + 5 ether);
        assertEq(raise.getCampaign(id).raised, GOAL + 5 ether);
        assertEq(uint8(raise.statusOf(id)), uint8(OpenRaise.Status.Active));
    }

    function test_contribute_token() public {
        uint256 id = _createToken(100e6);
        vm.prank(alice);
        raise.contribute(id, 40e6);
        assertEq(token.balanceOf(address(raise)), 40e6);
        assertEq(raise.contributionOf(id, alice), 40e6);
    }

    function test_contribute_tokenWithoutApprovalReverts() public {
        uint256 id = _createToken(100e6);
        address carol = makeAddr("carol");
        token.mint(carol, 10e6);
        vm.prank(carol);
        vm.expectRevert();
        raise.contribute(id, 10e6);
    }

    // ------------------------------------------------------------------
    // Goal boundary (inclusive)
    // ------------------------------------------------------------------

    function test_goal_exactIsSuccessful() public {
        uint256 id = _createEth();
        _give(alice, id, GOAL);
        vm.warp(deadline);
        assertEq(uint8(raise.statusOf(id)), uint8(OpenRaise.Status.Successful));
    }

    function test_goal_oneWeiShortIsFailed() public {
        uint256 id = _createEth();
        _give(alice, id, GOAL - 1);
        vm.warp(deadline);
        assertEq(uint8(raise.statusOf(id)), uint8(OpenRaise.Status.Failed));
    }

    function test_goal_aboveIsSuccessful() public {
        uint256 id = _createEth();
        _give(alice, id, GOAL + 1);
        vm.warp(deadline);
        assertEq(uint8(raise.statusOf(id)), uint8(OpenRaise.Status.Successful));
    }

    function test_noContributionsIsFailed() public {
        uint256 id = _createEth();
        vm.warp(deadline);
        assertEq(uint8(raise.statusOf(id)), uint8(OpenRaise.Status.Failed));
    }

    // ------------------------------------------------------------------
    // Withdrawal
    // ------------------------------------------------------------------

    function test_withdraw_success() public {
        uint256 id = _createEth();
        _give(alice, id, 6 ether);
        _give(bob, id, 5 ether);
        vm.warp(deadline);

        vm.expectEmit(true, true, false, true);
        emit OpenRaise.Withdrawn(id, owner, 11 ether);
        vm.prank(owner);
        raise.withdraw(id);

        assertEq(owner.balance, 11 ether);
        assertEq(address(raise).balance, 0);
        assertEq(uint8(raise.statusOf(id)), uint8(OpenRaise.Status.Withdrawn));
    }

    function test_withdraw_token() public {
        uint256 id = _createToken(100e6);
        vm.prank(alice);
        raise.contribute(id, 100e6);
        vm.warp(deadline);
        vm.prank(owner);
        raise.withdraw(id);
        assertEq(token.balanceOf(owner), 100e6);
    }

    function test_withdraw_beforeDeadlineReverts() public {
        uint256 id = _createEth();
        _give(alice, id, GOAL);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(OpenRaise.InvalidStatus.selector, OpenRaise.Status.Active));
        raise.withdraw(id);
    }

    function test_withdraw_unauthorizedReverts() public {
        uint256 id = _createEth();
        _give(alice, id, GOAL);
        vm.warp(deadline);
        vm.prank(alice);
        vm.expectRevert(OpenRaise.NotCampaignOwner.selector);
        raise.withdraw(id);
        vm.prank(admin);
        vm.expectRevert(OpenRaise.NotCampaignOwner.selector);
        raise.withdraw(id);
    }

    function test_withdraw_failedCampaignReverts() public {
        uint256 id = _createEth();
        _give(alice, id, GOAL - 1);
        vm.warp(deadline);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(OpenRaise.InvalidStatus.selector, OpenRaise.Status.Failed));
        raise.withdraw(id);
    }

    function test_withdraw_twiceReverts() public {
        uint256 id = _createEth();
        _give(alice, id, GOAL);
        vm.warp(deadline);
        vm.startPrank(owner);
        raise.withdraw(id);
        vm.expectRevert(abi.encodeWithSelector(OpenRaise.InvalidStatus.selector, OpenRaise.Status.Withdrawn));
        raise.withdraw(id);
        vm.stopPrank();
    }

    function test_withdraw_reentrancyBlocked() public {
        Reenterer evil = new Reenterer(raise);
        uint256 id = evil.create(1 ether, deadline);
        _give(alice, id, 1 ether);
        vm.warp(deadline);
        // Re-entry inside receive() reverts, which bubbles up as a failed ETH transfer.
        vm.expectRevert(OpenRaise.NativeTransferFailed.selector);
        evil.doWithdraw(id);
        assertEq(address(raise).balance, 1 ether);
    }

    function test_withdraw_rejectingOwnerRollsBack() public {
        RejectEth rejecter = new RejectEth();
        uint256 id = rejecter.create(raise, deadline);
        _give(alice, id, 1 ether);
        vm.warp(deadline);
        vm.expectRevert(OpenRaise.NativeTransferFailed.selector);
        rejecter.withdraw(raise, id);
        // State rolled back: still Successful, funds still held.
        assertEq(uint8(raise.statusOf(id)), uint8(OpenRaise.Status.Successful));
        assertEq(address(raise).balance, 1 ether);
    }

    // ------------------------------------------------------------------
    // Refunds
    // ------------------------------------------------------------------

    function test_refund_failedCampaign() public {
        uint256 id = _createEth();
        _give(alice, id, 3 ether);
        _give(bob, id, 2 ether);
        vm.warp(deadline);

        uint256 before = alice.balance;
        vm.expectEmit(true, true, false, true);
        emit OpenRaise.Refunded(id, alice, 3 ether);
        vm.prank(alice);
        raise.refund(id);

        assertEq(alice.balance, before + 3 ether);
        assertEq(raise.contributionOf(id, alice), 0);
        assertEq(raise.getCampaign(id).refunded, 3 ether);
        assertEq(raise.getCampaign(id).raised, 5 ether, "raised is historical, not decremented");
        assertEq(address(raise).balance, 2 ether);
    }

    function test_refund_token() public {
        uint256 id = _createToken(100e6);
        vm.prank(alice);
        raise.contribute(id, 40e6);
        uint256 before = token.balanceOf(alice);
        vm.warp(deadline);
        vm.prank(alice);
        raise.refund(id);
        assertEq(token.balanceOf(alice), before + 40e6);
    }

    function test_refund_twiceReverts() public {
        uint256 id = _createEth();
        _give(alice, id, 1 ether);
        vm.warp(deadline);
        vm.startPrank(alice);
        raise.refund(id);
        vm.expectRevert(OpenRaise.NothingToRefund.selector);
        raise.refund(id);
        vm.stopPrank();
    }

    function test_refund_nonContributorReverts() public {
        uint256 id = _createEth();
        _give(alice, id, 1 ether);
        vm.warp(deadline);
        vm.prank(bob);
        vm.expectRevert(OpenRaise.NothingToRefund.selector);
        raise.refund(id);
    }

    function test_refund_whileActiveReverts() public {
        uint256 id = _createEth();
        _give(alice, id, 1 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(OpenRaise.InvalidStatus.selector, OpenRaise.Status.Active));
        raise.refund(id);
    }

    function test_refund_successfulCampaignReverts() public {
        uint256 id = _createEth();
        _give(alice, id, GOAL);
        vm.warp(deadline);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(OpenRaise.InvalidStatus.selector, OpenRaise.Status.Successful));
        raise.refund(id);
    }

    function test_refund_reentrancyBlocked() public {
        uint256 id = _createEth();
        Reenterer evil = new Reenterer(raise);
        vm.deal(address(evil), 0);
        evil.contribute{value: 1 ether}(id);
        _give(alice, id, 1 ether);
        vm.warp(deadline);

        vm.expectRevert(OpenRaise.NativeTransferFailed.selector);
        evil.doRefund(id);
        assertEq(raise.contributionOf(id, address(evil)), 1 ether);
        assertEq(address(raise).balance, 2 ether);
    }

    function test_campaignsAreIsolated() public {
        uint256 a = _createEth();
        uint256 b = _createEth();
        _give(alice, a, GOAL);
        _give(bob, b, 1 ether);
        vm.warp(deadline);

        vm.prank(owner);
        raise.withdraw(a);
        vm.prank(bob);
        raise.refund(b);
        assertEq(address(raise).balance, 0);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(OpenRaise.InvalidStatus.selector, OpenRaise.Status.Withdrawn));
        raise.refund(a);
    }

    // ------------------------------------------------------------------
    // Edit (display text only)
    // ------------------------------------------------------------------

    function _meta(string memory title) internal pure returns (OpenRaise.CampaignMetadata memory) {
        return OpenRaise.CampaignMetadata({
            title: title,
            description: "Updated story",
            creatorName: "New Team",
            category: "Infra",
            imageURI: ""
        });
    }

    function test_update_ownerEditsTextWhileActive() public {
        uint256 id = _createEth();
        _give(alice, id, 1 ether);

        vm.expectEmit(true, false, false, true);
        emit OpenRaise.CampaignUpdated(id, "Renamed", "Infra");
        vm.prank(owner);
        raise.updateCampaign(id, _meta("Renamed"));

        OpenRaise.CampaignView memory v = raise.getCampaign(id);
        assertEq(v.title, "Renamed");
        assertEq(v.description, "Updated story");
        assertEq(v.creatorName, "New Team");
        assertEq(v.category, "Infra");
        // Terms backers agreed to are untouched.
        assertEq(v.goal, GOAL);
        assertEq(v.deadline, deadline);
        assertEq(v.asset, address(0));
        assertEq(v.raised, 1 ether);
    }

    function test_update_nonOwnerReverts() public {
        uint256 id = _createEth();
        vm.prank(alice);
        vm.expectRevert(OpenRaise.NotCampaignOwner.selector);
        raise.updateCampaign(id, _meta("x"));
        // The registry admin cannot edit either.
        vm.prank(admin);
        vm.expectRevert(OpenRaise.NotCampaignOwner.selector);
        raise.updateCampaign(id, _meta("x"));
    }

    function test_update_afterDeadlineReverts() public {
        uint256 id = _createEth();
        vm.warp(deadline);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(OpenRaise.InvalidStatus.selector, OpenRaise.Status.Failed));
        raise.updateCampaign(id, _meta("late"));
    }

    function test_update_cancelledReverts() public {
        uint256 id = _createEth();
        vm.startPrank(owner);
        raise.cancelCampaign(id);
        vm.expectRevert(abi.encodeWithSelector(OpenRaise.InvalidStatus.selector, OpenRaise.Status.Cancelled));
        raise.updateCampaign(id, _meta("x"));
        vm.stopPrank();
    }

    function test_update_validatesFields() public {
        uint256 id = _createEth();
        OpenRaise.CampaignMetadata memory m = _meta("");
        vm.startPrank(owner);
        vm.expectRevert(OpenRaise.InvalidTitle.selector);
        raise.updateCampaign(id, m);
        m.title = "ok";
        m.category = "";
        vm.expectRevert(OpenRaise.InvalidCategory.selector);
        raise.updateCampaign(id, m);
        m.category = "Infra";
        m.creatorName = string(new bytes(raise.MAX_CREATOR_NAME_BYTES() + 1));
        vm.expectRevert(OpenRaise.InvalidCreatorName.selector);
        raise.updateCampaign(id, m);
        m.creatorName = "ok";
        m.description = string(new bytes(raise.MAX_DESCRIPTION_BYTES() + 1));
        vm.expectRevert(OpenRaise.DescriptionTooLong.selector);
        raise.updateCampaign(id, m);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // Cancel ("delete") — owner or admin, while Active; backers refunded in full
    // ------------------------------------------------------------------

    function test_cancel_ownerWithBackers_refundsEveryone() public {
        uint256 id = _createEth();
        _give(alice, id, 3 ether);
        _give(bob, id, GOAL); // goal already met — owner may still cancel before the deadline

        vm.expectEmit(true, true, false, true);
        emit OpenRaise.CampaignCancelled(id, owner, false);
        vm.prank(owner);
        raise.cancelCampaign(id);
        assertEq(uint8(raise.statusOf(id)), uint8(OpenRaise.Status.Cancelled));

        // No refunds need to wait for the deadline.
        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        raise.refund(id);
        assertEq(alice.balance - aliceBefore, 3 ether);
        vm.prank(bob);
        raise.refund(id);
        assertEq(address(raise).balance, 0);

        // Still Cancelled after the deadline passes, even though raised >= goal.
        vm.warp(deadline + 1);
        assertEq(uint8(raise.statusOf(id)), uint8(OpenRaise.Status.Cancelled));
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(OpenRaise.InvalidStatus.selector, OpenRaise.Status.Cancelled));
        raise.withdraw(id);
    }

    function test_cancel_blocksContributions() public {
        uint256 id = _createEth();
        vm.prank(owner);
        raise.cancelCampaign(id);
        vm.expectRevert(abi.encodeWithSelector(OpenRaise.InvalidStatus.selector, OpenRaise.Status.Cancelled));
        _give(alice, id, 1 ether);
    }

    function test_cancel_byAdmin() public {
        uint256 id = _createEth();
        _give(alice, id, 1 ether);
        vm.expectEmit(true, true, false, true);
        emit OpenRaise.CampaignCancelled(id, admin, true);
        vm.prank(admin);
        raise.cancelCampaign(id);

        // Admin cannot take the funds — only the backer can reclaim them.
        uint256 adminBefore = admin.balance;
        vm.prank(admin);
        vm.expectRevert(OpenRaise.NotCampaignOwner.selector);
        raise.withdraw(id);
        vm.prank(admin);
        vm.expectRevert(OpenRaise.NothingToRefund.selector);
        raise.refund(id);
        assertEq(admin.balance, adminBefore);

        vm.prank(alice);
        raise.refund(id);
        assertEq(address(raise).balance, 0);
    }

    function test_cancel_unauthorizedReverts() public {
        uint256 id = _createEth();
        vm.prank(alice);
        vm.expectRevert(OpenRaise.NotAuthorized.selector);
        raise.cancelCampaign(id);
    }

    function test_cancel_onlyWhileActive() public {
        uint256 a = _createEth();
        uint256 b = _createEth();
        _give(alice, b, GOAL);

        vm.warp(deadline - 1);
        vm.prank(owner);
        raise.cancelCampaign(a); // last second is still Active

        vm.warp(deadline);
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(OpenRaise.InvalidStatus.selector, OpenRaise.Status.Cancelled));
        raise.cancelCampaign(a);
        vm.expectRevert(abi.encodeWithSelector(OpenRaise.InvalidStatus.selector, OpenRaise.Status.Successful));
        raise.cancelCampaign(b);
        vm.stopPrank();
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(OpenRaise.InvalidStatus.selector, OpenRaise.Status.Successful));
        raise.cancelCampaign(b);
    }

    function test_cancel_refundOnlyOncePerBacker() public {
        uint256 id = _createEth();
        _give(alice, id, 1 ether);
        vm.prank(owner);
        raise.cancelCampaign(id);
        vm.startPrank(alice);
        raise.refund(id);
        vm.expectRevert(OpenRaise.NothingToRefund.selector);
        raise.refund(id);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // Hide (moderation flag, admin only, no effect on funds)
    // ------------------------------------------------------------------

    function test_hide_adminOnlyAndFlagOnly() public {
        uint256 id = _createEth();
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        raise.setHidden(id, true);

        vm.expectEmit(true, false, false, true);
        emit OpenRaise.CampaignHiddenSet(id, true);
        vm.prank(admin);
        raise.setHidden(id, true);
        assertTrue(raise.getCampaign(id).hidden);

        // Purely a display flag: the contract still behaves normally.
        _give(alice, id, 1 ether);
        assertEq(raise.getCampaign(id).raised, 1 ether);

        vm.prank(admin);
        raise.setHidden(id, false);
        assertFalse(raise.getCampaign(id).hidden);
    }

    function test_hide_unknownCampaignReverts() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(OpenRaise.CampaignNotFound.selector, 99));
        raise.setHidden(99, true);
    }

    // ------------------------------------------------------------------
    // Images (ipfs:// or https:// link; admin can remove + lock)
    // ------------------------------------------------------------------

    string constant IMG = "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

    function test_image_setOnCreateAndEdit() public {
        OpenRaise.CampaignParams memory p = params(address(0), 1 ether, deadline, "img", "");
        p.imageURI = IMG;
        vm.prank(owner);
        uint256 id = raise.createCampaign(p);
        assertEq(raise.getCampaign(id).imageURI, IMG);

        OpenRaise.CampaignMetadata memory m = _meta("img");
        m.imageURI = "https://example.org/cover.png";
        vm.prank(owner);
        raise.updateCampaign(id, m);
        assertEq(raise.getCampaign(id).imageURI, "https://example.org/cover.png");

        m.imageURI = ""; // owner may remove their own image
        vm.prank(owner);
        raise.updateCampaign(id, m);
        assertEq(raise.getCampaign(id).imageURI, "");
    }

    function test_image_rejectsBadSchemesAndLength() public {
        OpenRaise.CampaignParams memory p = params(address(0), 1, deadline, "t", "");
        string[4] memory bad =
            ["http://insecure.example/x.png", "javascript:alert(1)", "data:image/png;base64,AAAA", "ipfs:/x"];
        for (uint256 i; i < bad.length; ++i) {
            p.imageURI = bad[i];
            vm.expectRevert(OpenRaise.InvalidImageURI.selector);
            raise.createCampaign(p);
        }
        bytes memory long = new bytes(raise.MAX_IMAGE_URI_BYTES() + 1);
        for (uint256 i; i < long.length; ++i) {
            long[i] = "a";
        }
        p.imageURI = string.concat("https://", string(long));
        vm.expectRevert(OpenRaise.InvalidImageURI.selector);
        raise.createCampaign(p);
    }

    function test_image_adminLockRemovesAndBlocksOwner() public {
        OpenRaise.CampaignParams memory p = params(address(0), 1 ether, deadline, "img", "");
        p.imageURI = IMG;
        vm.prank(owner);
        uint256 id = raise.createCampaign(p);

        vm.expectEmit(true, false, false, true);
        emit OpenRaise.CampaignImageLocked(id, true);
        vm.prank(admin);
        raise.setImageLocked(id, true);
        OpenRaise.CampaignView memory v = raise.getCampaign(id);
        assertEq(v.imageURI, "");
        assertTrue(v.imageLocked);

        // Owner can still edit text, but not re-add an image.
        OpenRaise.CampaignMetadata memory m = _meta("still editable");
        vm.prank(owner);
        raise.updateCampaign(id, m);
        assertEq(raise.getCampaign(id).title, "still editable");
        m.imageURI = IMG;
        vm.prank(owner);
        vm.expectRevert(OpenRaise.ImageLocked.selector);
        raise.updateCampaign(id, m);

        // Unlocking lets the owner set an image again.
        vm.prank(admin);
        raise.setImageLocked(id, false);
        vm.prank(owner);
        raise.updateCampaign(id, m);
        assertEq(raise.getCampaign(id).imageURI, IMG);
    }

    function test_image_lockIsAdminOnlyAndWorksAfterEnd() public {
        uint256 id = _createEth();
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        raise.setImageLocked(id, true);

        vm.warp(deadline + 1); // moderation still possible after the campaign ends
        vm.prank(admin);
        raise.setImageLocked(id, true);
        assertTrue(raise.getCampaign(id).imageLocked);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(OpenRaise.CampaignNotFound.selector, 77));
        raise.setImageLocked(77, true);
    }

    function test_updateImage_anyStatus_imageOnly() public {
        // One campaign per terminal path: Failed, Withdrawn, Cancelled.
        uint256 failed = _createEth();
        uint256 done = _createEth();
        uint256 cancelled = _createEth();
        _give(alice, done, GOAL);
        vm.prank(owner);
        raise.cancelCampaign(cancelled);
        vm.warp(deadline);
        vm.prank(owner);
        raise.withdraw(done);

        uint256[3] memory ids = [failed, done, cancelled];
        OpenRaise.Status[3] memory expected =
            [OpenRaise.Status.Failed, OpenRaise.Status.Withdrawn, OpenRaise.Status.Cancelled];
        for (uint256 i; i < 3; ++i) {
            OpenRaise.CampaignView memory before = raise.getCampaign(ids[i]);
            vm.expectEmit(true, false, false, true);
            emit OpenRaise.CampaignImageUpdated(ids[i], IMG);
            vm.prank(owner);
            raise.updateImage(ids[i], IMG);

            OpenRaise.CampaignView memory v = raise.getCampaign(ids[i]);
            assertEq(v.imageURI, IMG);
            // Nothing else changes: status, text and money stay exactly as they were.
            assertEq(uint8(v.status), uint8(expected[i]));
            assertEq(v.title, before.title);
            assertEq(v.description, before.description);
            assertEq(v.raised, before.raised);
            assertEq(v.refunded, before.refunded);
        }

        // Text edits are still refused after the end.
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(OpenRaise.InvalidStatus.selector, OpenRaise.Status.Failed));
        raise.updateCampaign(failed, _meta("late"));

        // Clearing works too.
        vm.prank(owner);
        raise.updateImage(failed, "");
        assertEq(raise.getCampaign(failed).imageURI, "");
    }

    function test_updateImage_ownerOnly_validated_respectsLock() public {
        uint256 id = _createEth();
        vm.prank(alice);
        vm.expectRevert(OpenRaise.NotCampaignOwner.selector);
        raise.updateImage(id, IMG);
        vm.prank(admin);
        vm.expectRevert(OpenRaise.NotCampaignOwner.selector);
        raise.updateImage(id, IMG);

        vm.prank(owner);
        vm.expectRevert(OpenRaise.InvalidImageURI.selector);
        raise.updateImage(id, "http://insecure.example/x.png");

        vm.prank(admin);
        raise.setImageLocked(id, true);
        vm.startPrank(owner);
        vm.expectRevert(OpenRaise.ImageLocked.selector);
        raise.updateImage(id, IMG);
        raise.updateImage(id, ""); // clearing is always allowed
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // Pagination
    // ------------------------------------------------------------------

    function test_getCampaigns_newestFirstAndBounded() public {
        for (uint256 i; i < 5; ++i) {
            _createEth();
        }
        OpenRaise.CampaignView[] memory page = raise.getCampaigns(0, 2);
        assertEq(page.length, 2);
        assertEq(page[0].id, 5);
        assertEq(page[1].id, 4);

        page = raise.getCampaigns(4, 10);
        assertEq(page.length, 1);
        assertEq(page[0].id, 1);

        assertEq(raise.getCampaigns(5, 10).length, 0);
    }

    // ------------------------------------------------------------------
    // Fuzz
    // ------------------------------------------------------------------

    function testFuzz_statusMatchesGoalRule(uint96 goal, uint96 a, uint96 b) public {
        goal = uint96(bound(goal, 1, 1_000 ether));
        a = uint96(bound(a, 1, 50 ether));
        b = uint96(bound(b, 1, 50 ether));
        vm.prank(owner);
        uint256 id = raise.createCampaign(params(address(0), goal, deadline, "f", ""));
        _give(alice, id, a);
        _give(bob, id, b);
        vm.warp(deadline);

        OpenRaise.Status expected =
            uint256(a) + b >= goal ? OpenRaise.Status.Successful : OpenRaise.Status.Failed;
        assertEq(uint8(raise.statusOf(id)), uint8(expected));
    }

    function testFuzz_refundReturnsExactContribution(uint96 a, uint96 b) public {
        a = uint96(bound(a, 1, 4 ether));
        b = uint96(bound(b, 1, 4 ether));
        uint256 id = _createEth(); // GOAL = 10 ether, so a + b < GOAL
        _give(alice, id, a);
        _give(alice, id, b);
        vm.warp(deadline);

        uint256 before = alice.balance;
        vm.prank(alice);
        raise.refund(id);
        assertEq(alice.balance - before, uint256(a) + b);
        assertEq(address(raise).balance, 0);
    }
}
