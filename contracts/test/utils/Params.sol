// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {OpenRaise} from "../../src/OpenRaise.sol";

/// @dev Builds CampaignParams with default display fields so tests stay focused on what they check.
function params(address asset, uint256 goal, uint64 deadline, string memory title, string memory description)
    pure
    returns (OpenRaise.CampaignParams memory)
{
    return OpenRaise.CampaignParams({
        asset: asset,
        goal: goal,
        deadline: deadline,
        title: title,
        description: description,
        creatorName: "Test Team",
        category: "Tooling",
        imageURI: ""
    });
}
