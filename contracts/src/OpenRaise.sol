// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title OpenRaise — all-or-nothing crowdfunding (technical demo, testnet/local only)
/// @notice Campaigns raise native ETH or one allowlisted ERC-20. After the deadline a campaign is
///         Successful if `raised >= goal` (inclusive), otherwise Failed. Successful campaigns can be
///         withdrawn once by their owner; contributors to Failed campaigns can each claim a refund once.
///
///         While Active, the owner may edit display text (never goal, deadline or asset) and may cancel.
///         The cover image alone may be changed by the owner in any status (unless locked by the admin).
///         The registry admin may cancel any Active campaign, hide campaigns from frontends, and remove
///         (and lock) a campaign's image.
///         A Cancelled campaign accepts no contributions and refunds every backer in full.
///         Nobody — owner or admin — can move funds except via `withdraw` (Successful) or `refund`.
/// @dev    NOT AUDITED. Do not use with real funds.
///
///         Time semantics: contributions are accepted while `block.timestamp < deadline`.
///         At `block.timestamp == deadline` the campaign has ended.
///
///         Asset semantics: `address(0)` denotes native ETH. ERC-20s must be allowlisted by the
///         registry owner; fee-on-transfer and rebasing tokens break accounting and must not be allowed.
contract OpenRaise is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        Active,
        Successful,
        Failed,
        Withdrawn,
        Cancelled
    }

    struct Campaign {
        address owner;
        uint64 deadline;
        bool withdrawn;
        bool cancelled;
        bool hidden;
        bool imageLocked;
        address asset;
        uint256 goal;
        uint256 raised;
        uint256 refunded;
        string title;
        string description;
        string creatorName;
        string category;
        string imageURI;
    }

    /// @dev Grouped into a struct to keep `createCampaign` readable and under the stack limit.
    struct CampaignParams {
        address asset;
        uint256 goal;
        uint64 deadline;
        string title;
        string description;
        string creatorName;
        string category;
        string imageURI;
    }

    /// @dev The editable display fields of a campaign.
    struct CampaignMetadata {
        string title;
        string description;
        string creatorName;
        string category;
        string imageURI;
    }

    struct CampaignView {
        uint256 id;
        address owner;
        address asset;
        uint256 goal;
        uint64 deadline;
        uint256 raised;
        uint256 refunded;
        Status status;
        string title;
        string description;
        string creatorName;
        string category;
        string imageURI;
        bool hidden;
        bool imageLocked;
    }

    address public constant NATIVE = address(0);
    uint256 public constant MIN_DURATION = 1 minutes;
    uint256 public constant MAX_DURATION = 365 days;
    uint256 public constant MAX_TITLE_BYTES = 80;
    uint256 public constant MAX_DESCRIPTION_BYTES = 1000;
    uint256 public constant MAX_CREATOR_NAME_BYTES = 48;
    uint256 public constant MAX_CATEGORY_BYTES = 24;
    uint256 public constant MAX_IMAGE_URI_BYTES = 256;

    uint256 public campaignCount;
    mapping(uint256 id => Campaign) private _campaigns;
    mapping(uint256 id => mapping(address contributor => uint256 amount)) public contributionOf;
    mapping(address asset => bool) public isAssetAllowed;

    event AssetAllowed(address indexed asset, bool allowed);
    event CampaignCreated(
        uint256 indexed id,
        address indexed owner,
        address indexed asset,
        uint256 goal,
        uint64 deadline,
        string title,
        string category
    );
    event Contributed(uint256 indexed id, address indexed contributor, uint256 amount, uint256 totalRaised);
    event Withdrawn(uint256 indexed id, address indexed owner, uint256 amount);
    event Refunded(uint256 indexed id, address indexed contributor, uint256 amount);
    event CampaignUpdated(uint256 indexed id, string title, string category);
    event CampaignCancelled(uint256 indexed id, address indexed by, bool byAdmin);
    event CampaignHiddenSet(uint256 indexed id, bool hidden);
    event CampaignImageLocked(uint256 indexed id, bool locked);
    event CampaignImageUpdated(uint256 indexed id, string imageURI);

    error AssetNotAllowed(address asset);
    error InvalidGoal();
    error InvalidDeadline();
    error InvalidTitle();
    error DescriptionTooLong();
    error InvalidCreatorName();
    error InvalidCategory();
    error CampaignNotFound(uint256 id);
    error InvalidAmount();
    error InvalidStatus(Status current);
    error NotCampaignOwner();
    error NotAuthorized();
    error InvalidImageURI();
    error ImageLocked();
    error NothingToRefund();
    error NativeTransferFailed();

    constructor(address initialOwner) Ownable(initialOwner) {
        isAssetAllowed[NATIVE] = true;
        emit AssetAllowed(NATIVE, true);
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    /// @notice Allow or disallow an ERC-20 for new campaigns. Existing campaigns are unaffected.
    function setAssetAllowed(address asset, bool allowed) external onlyOwner {
        if (asset == NATIVE) revert AssetNotAllowed(asset);
        isAssetAllowed[asset] = allowed;
        emit AssetAllowed(asset, allowed);
    }

    /// @notice Moderation flag for frontends. Has no effect on funds or on what the contract accepts;
    ///         use `cancelCampaign` to stop contributions and open refunds.
    function setHidden(uint256 id, bool hidden) external onlyOwner {
        _get(id).hidden = hidden;
        emit CampaignHiddenSet(id, hidden);
    }

    // ------------------------------------------------------------------
    // Campaign lifecycle
    // ------------------------------------------------------------------

    /// @notice Moderation: `locked = true` removes the campaign's image and stops the owner adding one;
    ///         `locked = false` lets the owner set an image again. Works in any status; never touches funds.
    function setImageLocked(uint256 id, bool locked) external onlyOwner {
        Campaign storage c = _get(id);
        c.imageLocked = locked;
        if (locked) c.imageURI = "";
        emit CampaignImageLocked(id, locked);
    }

    /// @notice Opens a campaign. Goal, deadline and asset are fixed forever; text fields are untrusted
    ///         display data that the owner may edit while Active.
    function createCampaign(CampaignParams calldata p) external returns (uint256 id) {
        if (!isAssetAllowed[p.asset]) revert AssetNotAllowed(p.asset);
        if (p.goal == 0) revert InvalidGoal();
        if (p.deadline < block.timestamp + MIN_DURATION || p.deadline > block.timestamp + MAX_DURATION) {
            revert InvalidDeadline();
        }
        _validateMetadata(p.title, p.description, p.creatorName, p.category);
        _validateImageURI(p.imageURI);

        id = ++campaignCount;
        Campaign storage c = _campaigns[id];
        c.owner = msg.sender;
        c.deadline = p.deadline;
        c.asset = p.asset;
        c.goal = p.goal;
        c.title = p.title;
        c.description = p.description;
        c.creatorName = p.creatorName;
        c.category = p.category;
        c.imageURI = p.imageURI;

        emit CampaignCreated(id, msg.sender, p.asset, p.goal, p.deadline, p.title, p.category);
    }

    /// @notice Owner edits display text while Active. Goal, deadline and asset can never change,
    ///         so backers keep the terms they contributed under.
    function updateCampaign(uint256 id, CampaignMetadata calldata m) external {
        Campaign storage c = _get(id);
        if (msg.sender != c.owner) revert NotCampaignOwner();
        Status s = _status(c);
        if (s != Status.Active) revert InvalidStatus(s);
        _validateMetadata(m.title, m.description, m.creatorName, m.category);
        _validateImageURI(m.imageURI);
        if (c.imageLocked && bytes(m.imageURI).length != 0) revert ImageLocked();

        c.title = m.title;
        c.description = m.description;
        c.creatorName = m.creatorName;
        c.category = m.category;
        c.imageURI = m.imageURI;
        emit CampaignUpdated(id, m.title, m.category);
    }

    /// @notice Owner sets, replaces or clears the cover image in ANY status. The image is cosmetic: terms and
    ///         text stay frozen after the campaign ends. Blocked (except clearing) while the admin has locked it.
    function updateImage(uint256 id, string calldata imageURI) external {
        Campaign storage c = _get(id);
        if (msg.sender != c.owner) revert NotCampaignOwner();
        _validateImageURI(imageURI);
        if (c.imageLocked && bytes(imageURI).length != 0) revert ImageLocked();
        c.imageURI = imageURI;
        emit CampaignImageUpdated(id, imageURI);
    }

    /// @notice Stops an Active campaign. Callable by its owner or the registry admin. No funds move:
    ///         every backer can then `refund` their full contribution, and `withdraw` is impossible.
    function cancelCampaign(uint256 id) external {
        Campaign storage c = _get(id);
        bool byAdmin = msg.sender == owner() && msg.sender != c.owner;
        if (msg.sender != c.owner && !byAdmin) revert NotAuthorized();
        Status s = _status(c);
        if (s != Status.Active) revert InvalidStatus(s);

        c.cancelled = true;
        emit CampaignCancelled(id, msg.sender, byAdmin);
    }

    /// @notice Contribute `amount` base units. For ETH campaigns `msg.value` must equal `amount`;
    ///         for ERC-20 campaigns `msg.value` must be zero and `amount` must be approved first.
    function contribute(uint256 id, uint256 amount) external payable nonReentrant {
        Campaign storage c = _get(id);
        Status s = _status(c);
        if (s != Status.Active) revert InvalidStatus(s);
        if (amount == 0) revert InvalidAmount();

        if (c.asset == NATIVE) {
            if (msg.value != amount) revert InvalidAmount();
        } else if (msg.value != 0) {
            revert InvalidAmount();
        }

        // Effects
        c.raised += amount;
        contributionOf[id][msg.sender] += amount;
        emit Contributed(id, msg.sender, amount, c.raised);

        // Interactions (pull tokens in)
        if (c.asset != NATIVE) {
            IERC20(c.asset).safeTransferFrom(msg.sender, address(this), amount);
        }
    }

    /// @notice Owner withdraws the full raised amount of a Successful campaign, once.
    function withdraw(uint256 id) external nonReentrant {
        Campaign storage c = _get(id);
        if (msg.sender != c.owner) revert NotCampaignOwner();
        Status s = _status(c);
        if (s != Status.Successful) revert InvalidStatus(s);

        // Effects
        c.withdrawn = true;
        uint256 amount = c.raised;
        emit Withdrawn(id, msg.sender, amount);

        // Interaction
        _send(c.asset, msg.sender, amount);
    }

    /// @notice Contributor reclaims their full recorded contribution from a Failed or Cancelled campaign, once.
    function refund(uint256 id) external nonReentrant {
        Campaign storage c = _get(id);
        Status s = _status(c);
        if (s != Status.Failed && s != Status.Cancelled) revert InvalidStatus(s);

        uint256 amount = contributionOf[id][msg.sender];
        if (amount == 0) revert NothingToRefund();

        // Effects
        contributionOf[id][msg.sender] = 0;
        c.refunded += amount;
        emit Refunded(id, msg.sender, amount);

        // Interaction
        _send(c.asset, msg.sender, amount);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function statusOf(uint256 id) external view returns (Status) {
        return _status(_get(id));
    }

    function getCampaign(uint256 id) public view returns (CampaignView memory) {
        Campaign storage c = _get(id);
        return CampaignView({
            id: id,
            owner: c.owner,
            asset: c.asset,
            goal: c.goal,
            deadline: c.deadline,
            raised: c.raised,
            refunded: c.refunded,
            status: _status(c),
            title: c.title,
            description: c.description,
            creatorName: c.creatorName,
            category: c.category,
            imageURI: c.imageURI,
            hidden: c.hidden,
            imageLocked: c.imageLocked
        });
    }

    /// @notice Paginated read, newest first. `limit` bounds the loop; intended for offchain calls only.
    /// @param offset Number of newest campaigns to skip.
    function getCampaigns(uint256 offset, uint256 limit) external view returns (CampaignView[] memory page) {
        uint256 total = campaignCount;
        if (offset >= total) return new CampaignView[](0);
        uint256 remaining = total - offset;
        uint256 n = limit < remaining ? limit : remaining;
        page = new CampaignView[](n);
        for (uint256 i; i < n; ++i) {
            page[i] = getCampaign(total - offset - i);
        }
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------

    function _get(uint256 id) private view returns (Campaign storage c) {
        c = _campaigns[id];
        if (c.owner == address(0)) revert CampaignNotFound(id);
    }

    function _lengthIn(string calldata s, uint256 min, uint256 max) private pure returns (bool) {
        uint256 len = bytes(s).length;
        return len >= min && len <= max;
    }

    function _validateMetadata(
        string calldata title,
        string calldata description,
        string calldata creatorName,
        string calldata category
    ) private pure {
        if (!_lengthIn(title, 1, MAX_TITLE_BYTES)) revert InvalidTitle();
        if (bytes(description).length > MAX_DESCRIPTION_BYTES) revert DescriptionTooLong();
        if (!_lengthIn(creatorName, 1, MAX_CREATOR_NAME_BYTES)) revert InvalidCreatorName();
        if (!_lengthIn(category, 1, MAX_CATEGORY_BYTES)) revert InvalidCategory();
    }

    /// @dev Empty, or an `ipfs://` / `https://` link of at most MAX_IMAGE_URI_BYTES. Frontends must still treat it as untrusted.
    function _validateImageURI(string calldata uri) private pure {
        bytes calldata b = bytes(uri);
        if (b.length == 0) return;
        if (b.length > MAX_IMAGE_URI_BYTES) revert InvalidImageURI();
        if (!_hasPrefix(b, "ipfs://") && !_hasPrefix(b, "https://")) revert InvalidImageURI();
    }

    function _hasPrefix(bytes calldata b, bytes memory prefix) private pure returns (bool) {
        if (b.length < prefix.length) return false;
        for (uint256 i; i < prefix.length; ++i) {
            if (b[i] != prefix[i]) return false;
        }
        return true;
    }

    function _status(Campaign storage c) private view returns (Status) {
        if (c.withdrawn) return Status.Withdrawn;
        if (c.cancelled) return Status.Cancelled;
        if (block.timestamp < c.deadline) return Status.Active;
        return c.raised >= c.goal ? Status.Successful : Status.Failed;
    }

    function _send(address asset, address to, uint256 amount) private {
        if (asset == NATIVE) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert NativeTransferFailed();
        } else {
            IERC20(asset).safeTransfer(to, amount);
        }
    }
}
