// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {RevenueRouter, RevenueRouterTypes} from "../RevenueRouter.sol";

abstract contract RevenueRouterTestBase is Test {
    RevenueRouter internal router;

    address internal owner = makeAddr("owner");
    address internal payout = makeAddr("payout");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant T0 = 1_700_000_000;
    uint256 internal constant U = 1e12; // native units per 6-dec unit
    uint256 internal constant PERIOD = 30 days;
    uint128 internal constant MONTHLY_PRICE = 10e6;
    uint128 internal constant ONETIME_PRICE = 5e6;
    bytes32 internal constant REF = keccak256("order-1");

    uint256 internal merchantId;
    uint256 internal monthlyId;
    uint256 internal oneTimeId;

    function setUp() public virtual {
        vm.warp(T0);
        router = new RevenueRouter();
        vm.deal(owner, 1e30);
        vm.deal(alice, 1e30);
        vm.deal(bob, 1e30);
        vm.deal(carol, 1e30);
        vm.deal(stranger, 1e30);

        vm.startPrank(owner);
        merchantId = router.registerMerchant("Acme", "acme", payout);
        monthlyId = router.createProduct(merchantId, "Pro", MONTHLY_PRICE, RevenueRouter.Billing.Monthly);
        oneTimeId = router.createProduct(merchantId, "Ebook", ONETIME_PRICE, RevenueRouter.Billing.OneTime);
        vm.stopPrank();
    }

    function _value(uint256 productId) internal view returns (uint256) {
        return uint256(router.getProduct(productId).price) * U;
    }

    /// @dev Pay the current price of `productId` as `who`.
    function _pay(address who, uint256 productId) internal returns (uint256 paymentId) {
        uint256 v = _value(productId);
        vm.prank(who);
        paymentId = router.pay{value: v}(productId, REF);
    }

    /// @dev Refund `paymentId` as the merchant owner with the exact value.
    function _refund(uint256 paymentId) internal {
        uint256 v = uint256(router.getPayment(paymentId).amount) * U;
        vm.prank(owner);
        router.refund{value: v}(paymentId);
    }

    /// @dev Expect the next refund by owner (exact value) to revert with `selector`.
    function _expectRefundRevert(uint256 paymentId, bytes4 selector) internal {
        uint256 v = uint256(router.getPayment(paymentId).amount) * U;
        vm.prank(owner);
        vm.expectRevert(selector);
        router.refund{value: v}(paymentId);
    }

    function _setPrice(uint256 productId, uint128 price) internal {
        vm.prank(owner);
        router.updateProduct(productId, "Pro", price);
    }

    /// @dev Alice pays three back-to-back monthly periods at T0 with prices 10/20/30 USDC.
    /// P1: [T0, T0+30d], P2: [T0+30d, T0+60d], P3: [T0+60d, T0+90d].
    function _threePeriods() internal returns (uint256 p1, uint256 p2, uint256 p3) {
        p1 = _pay(alice, monthlyId);
        _setPrice(monthlyId, 20e6);
        p2 = _pay(alice, monthlyId);
        _setPrice(monthlyId, 30e6);
        p3 = _pay(alice, monthlyId);
    }
}
