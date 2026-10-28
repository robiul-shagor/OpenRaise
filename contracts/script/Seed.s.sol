// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {OpenRaise} from "../src/OpenRaise.sol";
import {MockERC20} from "../src/MockERC20.sol";

/// @notice Local Anvil only: seeds demo campaigns using Anvil's default dev accounts.
contract Seed is Script {
    // Anvil's default, publicly known dev mnemonic. Never holds real funds.
    string constant ANVIL_MNEMONIC = "test test test test test test test test test test test junk";

    function _p(
        address asset,
        uint256 goal,
        uint64 deadline,
        string memory title,
        string memory description,
        string memory creatorName,
        string memory category
    ) private pure returns (OpenRaise.CampaignParams memory) {
        return OpenRaise.CampaignParams(asset, goal, deadline, title, description, creatorName, category, "");
    }

    function run() external {
        require(block.chainid == 31337, "Seed: Anvil only");
        uint256 pk0 = vm.deriveKey(ANVIL_MNEMONIC, 0);
        uint256 pk1 = vm.deriveKey(ANVIL_MNEMONIC, 1);
        uint256 pk2 = vm.deriveKey(ANVIL_MNEMONIC, 2);
        string memory json = vm.readFile("deployments/31337.json");
        OpenRaise raise = OpenRaise(vm.parseJsonAddress(json, ".openRaise"));
        MockERC20 token = MockERC20(vm.parseJsonAddress(json, ".mockToken"));

        uint64 soon = uint64(block.timestamp + 10 minutes);
        uint64 later = uint64(block.timestamp + 14 days);

        // Owner: account #0
        vm.startBroadcast(pk0);
        uint256 garden = raise.createCampaign(
            _p(
                address(0),
                5 ether,
                soon,
                "Community Garden Beds",
                "Raised beds and soil for a neighbourhood garden. Demo campaign: will reach its goal.",
                "Green Corner Collective",
                "Public goods"
            )
        );
        uint256 zine = raise.createCampaign(
            _p(
                address(0),
                20 ether,
                soon,
                "Open Source Zine Print Run",
                "Printing a small zine about open-source tooling. Demo campaign: will fall short and allow refunds.",
                "Zine Club",
                "Education"
            )
        );
        uint256 lab = raise.createCampaign(
            _p(
                address(token),
                2_500e6,
                later,
                "Maker Lab Tools",
                "Shared tools for a maker space, raised in the mock mUSD token. Still open for contributions.",
                "Maker Lab",
                "Hardware"
            )
        );
        uint256 rpc = raise.createCampaign(
            _p(
                address(0),
                8 ether,
                later,
                "Community RPC Node for Dev Meetups",
                "A shared test node so workshop attendees don't hit public rate limits. Still open.",
                "Meetup Organizers",
                "Infra"
            )
        );
        raise.createCampaign(
            _p(
                address(0),
                10 ether,
                later,
                "Block Explorer Plugin for Anvil",
                "A small open-source explorer for local chains. Still open, no backers yet.",
                "Explorer Builders",
                "Tooling"
            )
        );
        vm.stopBroadcast();

        // Contributor: account #1
        vm.startBroadcast(pk1);
        raise.contribute{value: 3 ether}(garden, 3 ether);
        raise.contribute{value: 4 ether}(zine, 4 ether);
        token.faucet();
        token.approve(address(raise), 600e6);
        raise.contribute(lab, 600e6);
        vm.stopBroadcast();

        // Contributor: account #2
        vm.startBroadcast(pk2);
        raise.contribute{value: 2 ether}(garden, 2 ether);
        raise.contribute{value: 1.5 ether}(zine, 1.5 ether);
        raise.contribute{value: 3 ether}(rpc, 3 ether);
        vm.stopBroadcast();
    }
}
