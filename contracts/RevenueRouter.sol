// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Namespaces the Payment struct to avoid colliding with the Payment event.
library RevenueRouterTypes {
    struct Payment {
        uint256 productId;
        address payer;
        uint128 amount;
        uint64 periodStart;
        uint64 periodEnd;
        bool refunded;
        /// @dev The subscription's latest payment before this one (0 if none); monthly only.
        uint256 prevPaymentId;
    }
}

/**
 * @title RevenueRouter
 * @notice RevProof: direct, native-USDC revenue payments on Arc.
 * @dev Arc's native USDC uses 18 decimals, while its ERC-20 view uses 6 decimals
 * of the same underlying pool. Prices, stored amounts and event amounts use the
 * 6-decimal unit; payable calls require exactly amount * 1e12 native units.
 * No approval, permit or transferFrom is needed: the customer signs one pay tx.
 * Arc Memo is not used because Memo.memo is nonpayable and cannot carry native
 * value. Instead, orderRef is a first-class pay argument emitted in Payment.
 * Payments from the merchant owner or current payout address are blocked.
 * "Verified" means USDC really moved onchain, not that the payer is independent:
 * another wallet controlled by the merchant can still pay.
 * All supplied value is forwarded atomically, without fees or custodial funds.
 * There is no receive, fallback, withdrawal, sweep, admin or upgrade mechanism.
 * Like any EVM contract, this contract cannot prevent forcibly credited native
 * value (or direct credits via Arc's ERC-20 view); such unsolicited funds have
 * no recovery path and are never used to fund a payment or refund.
 */
contract RevenueRouter is ReentrancyGuard {
    enum Billing { OneTime, Monthly }

    struct Merchant {
        address owner;
        address payout;
        string name;
        string slug;
    }

    struct Product {
        uint256 merchantId;
        string name;
        uint128 price;
        Billing billing;
        bool active;
    }

    struct Subscription {
        uint64 paidUntil;
        uint128 amount;
        bool listed;
        /// @dev Latest non-refunded payment of this subscription (0 if none).
        uint256 lastPaymentId;
    }

    struct SubKey {
        uint256 productId;
        address payer;
    }

    /// @notice Native units per one 6-decimal USDC unit.
    uint256 public constant NATIVE_PER_USDC_UNIT = 1e12;
    /// @notice Maximum product price in 6-decimal USDC units (one billion USDC).
    uint128 public constant MAX_PRICE = 1_000_000_000e6;
    /// @notice Fixed monthly subscription duration.
    uint256 public constant PERIOD = 30 days;

    /// @notice Number of registered merchants; IDs start at one.
    uint256 public merchantCount;
    /// @notice Number of products across all merchants; IDs start at one.
    uint256 public productCount;
    /// @notice Number of payments across all products; IDs start at one.
    uint256 public paymentCount;

    mapping(uint256 => Merchant) private _merchants;
    mapping(bytes32 => uint256) private _merchantIdsBySlug;
    mapping(uint256 => Product) private _products;
    mapping(uint256 => RevenueRouterTypes.Payment) private _payments;
    mapping(uint256 => mapping(address => Subscription)) private _subscriptions;
    mapping(uint256 => SubKey[]) private _merchantSubscriptions;

    error MerchantNotFound();
    error ProductNotFound();
    error PaymentNotFound();
    error Unauthorized();
    error InvalidName();
    error InvalidSlug();
    error SlugTaken();
    error InvalidPayout();
    error InvalidPrice();
    error ProductPaused();
    error SelfPayment();
    error IncorrectNativeValue(uint256 expected, uint256 actual);
    error NativeTransferFailed();
    error AlreadyRefunded();
    error RefundNewerFirst();
    error TimestampOverflow();

    event MerchantRegistered(uint256 indexed merchantId, address indexed owner, address payout, string slug, string name);
    event MerchantUpdated(uint256 indexed merchantId, address payout, string name);
    event ProductCreated(uint256 indexed merchantId, uint256 indexed productId, string name, uint128 price, uint8 billing);
    event ProductUpdated(uint256 indexed productId, string name, uint128 price);
    event ProductStatusChanged(uint256 indexed productId, bool active);
    event Payment(uint256 indexed merchantId, uint256 indexed productId, address indexed payer, uint256 paymentId, uint128 amount, uint64 paidAt, uint64 paidUntil, bytes32 orderRef);
    event Refund(uint256 indexed merchantId, uint256 indexed productId, address indexed payer, uint256 paymentId, uint128 amount, uint64 refundedAt, uint64 paidUntil);

    /// @notice Register a merchant with an immutable, globally unique lowercase slug.
    /// @return merchantId Newly allocated merchant ID. A wallet may register multiple merchants.
    function registerMerchant(string calldata name, string calldata slug, address payout)
        external returns (uint256 merchantId)
    {
        _validateName(name);
        _validateSlug(slug);
        _validatePayout(payout);
        bytes32 slugHash = keccak256(bytes(slug));
        if (_merchantIdsBySlug[slugHash] != 0) revert SlugTaken();

        merchantId = ++merchantCount;
        _merchants[merchantId] = Merchant(msg.sender, payout, name, slug);
        _merchantIdsBySlug[slugHash] = merchantId;
        emit MerchantRegistered(merchantId, msg.sender, payout, slug, name);
    }

    /// @notice Change the payout address of a merchant owned by the caller.
    function setPayout(uint256 merchantId, address newPayout) external {
        Merchant storage merchant = _ownedMerchant(merchantId);
        _validatePayout(newPayout);
        merchant.payout = newPayout;
        emit MerchantUpdated(merchantId, newPayout, merchant.name);
    }

    /// @notice Change a merchant's display name without changing its slug or owner.
    function setName(uint256 merchantId, string calldata name) external {
        Merchant storage merchant = _ownedMerchant(merchantId);
        _validateName(name);
        merchant.name = name;
        emit MerchantUpdated(merchantId, merchant.payout, name);
    }

    /// @notice Return an existing merchant; revert for an unknown ID.
    function getMerchant(uint256 merchantId) external view returns (Merchant memory) {
        return _merchant(merchantId);
    }

    /// @notice Resolve an exact slug to its merchant ID, or zero if unregistered.
    function merchantIdBySlug(string calldata slug) external view returns (uint256) {
        return _merchantIdsBySlug[keccak256(bytes(slug))];
    }

    /// @notice Create an active product with an immutable billing type.
    /// @param price Price in 6-decimal USDC units.
    /// @return productId Newly allocated global product ID.
    function createProduct(uint256 merchantId, string calldata name, uint128 price, Billing billing)
        external returns (uint256 productId)
    {
        _ownedMerchant(merchantId);
        _validateName(name);
        _validatePrice(price);
        productId = ++productCount;
        _products[productId] = Product(merchantId, name, price, billing, true);
        emit ProductCreated(merchantId, productId, name, price, uint8(billing));
    }

    /// @notice Update a product's name and future-payment price; billing stays unchanged.
    function updateProduct(uint256 productId, string calldata name, uint128 price) external {
        Product storage product = _product(productId);
        _ownedMerchant(product.merchantId);
        _validateName(name);
        _validatePrice(price);
        product.name = name;
        product.price = price;
        emit ProductUpdated(productId, name, price);
    }

    /// @notice Pause or unpause new payments; existing subscriptions remain unchanged.
    function setProductActive(uint256 productId, bool active) external {
        Product storage product = _product(productId);
        _ownedMerchant(product.merchantId);
        product.active = active;
        emit ProductStatusChanged(productId, active);
    }

    /// @notice Return an existing product; revert for an unknown ID.
    function getProduct(uint256 productId) external view returns (Product memory) {
        return _product(productId);
    }

    /// @notice Pay once in native USDC and forward the entire value to the merchant.
    /// @param orderRef Caller-supplied reference, emitted unchanged; not a uniqueness key.
    /// @return paymentId Newly allocated global payment ID.
    function pay(uint256 productId, bytes32 orderRef)
        external payable nonReentrant returns (uint256 paymentId)
    {
        Product storage product = _product(productId);
        if (!product.active) revert ProductPaused();
        Merchant storage merchant = _merchants[product.merchantId];
        address payout = merchant.payout;
        if (msg.sender == merchant.owner || msg.sender == payout) revert SelfPayment();
        uint128 amount = product.price;
        _validateValue(amount);

        paymentId = ++paymentCount;
        uint64 periodStart;
        uint64 periodEnd;
        uint256 prevPaymentId;
        if (product.billing == Billing.Monthly) {
            (periodStart, periodEnd, prevPaymentId) =
                _extendSubscription(productId, product.merchantId, amount, paymentId);
        }
        _payments[paymentId] = RevenueRouterTypes.Payment({
            productId: productId,
            payer: msg.sender,
            amount: amount,
            periodStart: periodStart,
            periodEnd: periodEnd,
            refunded: false,
            prevPaymentId: prevPaymentId
        });
        // Emit before interaction so receiver callbacks cannot reorder this payment's log.
        // A failed forward reverts the log and all state changes atomically.
        _emitPayment(product.merchantId, paymentId, orderRef);
        _forward(payout);
    }

    /// @notice Refund an entire payment using exactly the caller's supplied native USDC.
    /// @dev Only the merchant owner can refund, including while the product is paused.
    /// Refunding a monthly payment whose period has not fully elapsed rolls the expiry back
    /// to the start of that period, and is only allowed newest-first (RefundNewerFirst),
    /// so refunded time can never stay active. Fully elapsed periods can be refunded in any
    /// order and leave the expiry unchanged. The payer must be able to receive native USDC:
    /// a payer contract that rejects value, or a blocklisted payer, cannot be refunded
    /// through this contract (the whole refund reverts atomically).
    function refund(uint256 paymentId) external payable nonReentrant {
        RevenueRouterTypes.Payment storage payment = _payment(paymentId);
        Product storage product = _products[payment.productId];
        _ownedMerchant(product.merchantId);
        if (payment.refunded) revert AlreadyRefunded();
        _validateValue(payment.amount);
        payment.refunded = true;

        uint64 paidUntil;
        if (product.billing == Billing.Monthly) {
            paidUntil = _rollbackSubscription(paymentId, payment);
        }
        emit Refund(product.merchantId, payment.productId, payment.payer, paymentId,
            payment.amount, _timestamp(), paidUntil);
        _forward(payment.payer);
    }

    /// @notice Return an existing payment including its refund status.
    function getPayment(uint256 paymentId) external view returns (RevenueRouterTypes.Payment memory) {
        return _payment(paymentId);
    }

    /// @notice Return subscription expiry and latest payment amount, or zeros if absent.
    function subscriptionOf(uint256 productId, address payer)
        external view returns (uint64 paidUntil, uint128 amount)
    {
        _product(productId);
        Subscription storage sub = _subscriptions[productId][payer];
        return (sub.paidUntil, sub.amount);
    }

    /// @notice Whether this payer's subscription expires strictly after the current timestamp.
    function isSubscriptionActive(uint256 productId, address payer) external view returns (bool) {
        _product(productId);
        return _subscriptions[productId][payer].paidUntil > block.timestamp;
    }

    /// @notice Number of distinct monthly product/payer pairs ever listed for this merchant.
    function subscriptionCount(uint256 merchantId) external view returns (uint256) {
        _merchant(merchantId);
        return _merchantSubscriptions[merchantId].length;
    }

    /// @notice Sum latest payment amounts of all unexpired monthly subscriptions, in USDC units.
    /// @dev Linear in all subscriptions ever listed; use mrrPage for large merchants.
    function mrr(uint256 merchantId) external view returns (uint256 total) {
        _merchant(merchantId);
        (total,,) = _mrrPage(merchantId, 0, _merchantSubscriptions[merchantId].length);
    }

    /// @notice Sum active monthly subscriptions over at most limit list entries from offset.
    /// @dev nextOffset is the next unread index, clamped to the list length. A zero
    /// limit makes no progress. Use a common block when aggregating multiple pages.
    /// @return mrr USDC-unit amount contributed by this page.
    /// @return activeCount Number of active subscriptions in this page.
    /// @return nextOffset Next list offset; list length indicates completion.
    function mrrPage(uint256 merchantId, uint256 offset, uint256 limit)
        external view returns (uint256 mrr, uint256 activeCount, uint256 nextOffset)
    {
        _merchant(merchantId);
        return _mrrPage(merchantId, offset, limit);
    }

    function _extendSubscription(uint256 productId, uint256 merchantId, uint128 amount, uint256 paymentId)
        private returns (uint64 periodStart, uint64 periodEnd, uint256 prevPaymentId)
    {
        Subscription storage sub = _subscriptions[productId][msg.sender];
        uint256 start = block.timestamp > sub.paidUntil ? block.timestamp : sub.paidUntil;
        if (start > type(uint64).max - PERIOD) revert TimestampOverflow();
        periodStart = uint64(start);
        periodEnd = uint64(start + PERIOD);
        prevPaymentId = sub.lastPaymentId;
        sub.paidUntil = periodEnd;
        sub.amount = amount;
        sub.lastPaymentId = paymentId;
        if (!sub.listed) {
            sub.listed = true;
            _merchantSubscriptions[merchantId].push(SubKey(productId, msg.sender));
        }
    }

    /// @dev Applies a monthly refund to the subscription and returns its new paidUntil.
    /// A period that has not fully elapsed can only be refunded newest-first, so the
    /// expiry never keeps time that was refunded. Fully elapsed periods carry no access,
    /// so they can be refunded in any order without changing the expiry.
    function _rollbackSubscription(uint256 paymentId, RevenueRouterTypes.Payment storage payment)
        private returns (uint64)
    {
        Subscription storage sub = _subscriptions[payment.productId][payment.payer];
        bool isLatest = sub.lastPaymentId == paymentId;
        bool elapsed = payment.periodEnd <= block.timestamp;
        if (!isLatest) {
            if (!elapsed) revert RefundNewerFirst();
            return sub.paidUntil;
        }
        if (!elapsed) sub.paidUntil = payment.periodStart;
        // Point at the newest earlier payment that is still paid for.
        uint256 last = payment.prevPaymentId;
        while (last != 0 && _payments[last].refunded) last = _payments[last].prevPaymentId;
        sub.lastPaymentId = last;
        sub.amount = last == 0 ? 0 : _payments[last].amount;
        return sub.paidUntil;
    }

    function _emitPayment(uint256 merchantId, uint256 paymentId, bytes32 orderRef) private {
        RevenueRouterTypes.Payment storage payment = _payments[paymentId];
        emit Payment(merchantId, payment.productId, payment.payer, paymentId,
            payment.amount, _timestamp(), payment.periodEnd, orderRef);
    }

    function _mrrPage(uint256 merchantId, uint256 offset, uint256 limit)
        private view returns (uint256 total, uint256 activeCount, uint256 nextOffset)
    {
        SubKey[] storage keys = _merchantSubscriptions[merchantId];
        uint256 length = keys.length;
        if (offset >= length) return (0, 0, length);
        uint256 remaining = length - offset;
        nextOffset = offset + (limit < remaining ? limit : remaining);
        for (uint256 i = offset; i < nextOffset; ++i) {
            SubKey storage key = keys[i];
            Subscription storage sub = _subscriptions[key.productId][key.payer];
            if (sub.paidUntil > block.timestamp && _products[key.productId].billing == Billing.Monthly) {
                total += sub.amount;
                ++activeCount;
            }
        }
    }

    function _merchant(uint256 merchantId) private view returns (Merchant storage merchant) {
        merchant = _merchants[merchantId];
        if (merchant.owner == address(0)) revert MerchantNotFound();
    }

    function _ownedMerchant(uint256 merchantId) private view returns (Merchant storage merchant) {
        merchant = _merchant(merchantId);
        if (merchant.owner != msg.sender) revert Unauthorized();
    }

    function _product(uint256 productId) private view returns (Product storage product) {
        product = _products[productId];
        if (product.merchantId == 0) revert ProductNotFound();
    }

    function _payment(uint256 paymentId) private view returns (RevenueRouterTypes.Payment storage payment) {
        payment = _payments[paymentId];
        if (payment.payer == address(0)) revert PaymentNotFound();
    }

    function _validateName(string calldata name) private pure {
        uint256 length = bytes(name).length;
        if (length == 0 || length > 64) revert InvalidName();
    }

    function _validateSlug(string calldata slug) private pure {
        bytes memory value = bytes(slug);
        uint256 length = value.length;
        if (length < 3 || length > 32) revert InvalidSlug();
        if (value[0] == 0x2d || value[length - 1] == 0x2d) revert InvalidSlug();
        for (uint256 i; i < length; ++i) {
            bytes1 c = value[i];
            if (!((c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c == 0x2d)) {
                revert InvalidSlug();
            }
        }
    }

    function _validatePayout(address payout) private view {
        if (payout == address(0) || payout == address(this)) revert InvalidPayout();
    }

    function _validatePrice(uint128 price) private pure {
        if (price == 0 || price > MAX_PRICE) revert InvalidPrice();
    }

    function _validateValue(uint128 amount) private view {
        uint256 expected = uint256(amount) * NATIVE_PER_USDC_UNIT;
        if (msg.value != expected) revert IncorrectNativeValue(expected, msg.value);
    }

    function _timestamp() private view returns (uint64) {
        if (block.timestamp > type(uint64).max) revert TimestampOverflow();
        return uint64(block.timestamp);
    }

    function _forward(address recipient) private {
        (bool success,) = recipient.call{value: msg.value}("");
        if (!success) revert NativeTransferFailed();
    }
}
