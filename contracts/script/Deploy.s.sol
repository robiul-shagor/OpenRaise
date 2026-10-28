// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {OpenRaise} from "../src/OpenRaise.sol";
import {MockERC20} from "../src/MockERC20.sol";

/// @notice Deploys OpenRaise + a mock ERC-20 and writes addresses to deployments/<chainId>.json.
/// @dev    Refuses to run on Ethereum mainnet.
contract Deploy is Script {
    function run() external returns (OpenRaise raise, MockERC20 token) {
        require(block.chainid != 1, "OpenRaise demo: mainnet deployment is not allowed");

        vm.startBroadcast();
        address deployer = msg.sender;
        token = new MockERC20("Mock USD", "mUSD", 6);
        raise = new OpenRaise(deployer);
        raise.setAssetAllowed(address(token), true);
        vm.stopBroadcast();

        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "startBlock", block.number);
        vm.serializeAddress(key, "mockToken", address(token));
        string memory json = vm.serializeAddress(key, "openRaise", address(raise));
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));

        console2.log("OpenRaise:", address(raise));
        console2.log("MockERC20:", address(token));
    }
}
