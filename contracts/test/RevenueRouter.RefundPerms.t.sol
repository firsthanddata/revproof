// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {RevenueRouterTestBase} from "./RevenueRouter.Base.t.sol";
import {RevenueRouter} from "../RevenueRouter.sol";

/// @dev Alice holds three back-to-back monthly periods (all paid at T0):
///      P1 [T0, +30d] 10 USDC, P2 [+30d, +60d] 20 USDC, P3 [+60d, +90d] 30 USDC.
contract RevenueRouterRefundPermsTest is RevenueRouterTestBase {
    uint256 internal p1;
    uint256 internal p2;
    uint256 internal p3;

    function setUp() public override {
        super.setUp();
        (p1, p2, p3) = _threePeriods();
    }

    /// @dev Refund as owner, expecting a Refund event with the given paidUntil.
    function _refundExpect(uint256 id, uint128 amount, uint256 paidUntil) internal {
        uint256 v = uint256(amount) * U;
        vm.expectEmit(true, true, true, true, address(router));
        emit RevenueRouter.Refund(merchantId, monthlyId, alice, id, amount, uint64(block.timestamp), uint64(paidUntil));
        vm.prank(owner);
        router.refund{value: v}(id);
    }

    function _assertSub(uint256 until, uint128 amount, uint256 mrrExpected) internal view {
        (uint64 u, uint128 a) = router.subscriptionOf(monthlyId, alice);
        assertEq(u, until, "paidUntil");
        assertEq(a, amount, "amount");
        assertEq(router.isSubscriptionActive(monthlyId, alice), until > block.timestamp, "active");
        assertEq(router.mrr(merchantId), mrrExpected, "mrr");
    }

    function test_Setup_ThreePeriodsLayout() public view {
        _assertSub(T0 + 90 days, 30e6, 30e6);
        assertEq(router.getPayment(p1).periodStart, T0);
        assertEq(router.getPayment(p2).periodStart, T0 + 30 days);
        assertEq(router.getPayment(p3).periodStart, T0 + 60 days);
        assertEq(router.getPayment(p3).periodEnd, T0 + 90 days);
        assertEq(router.getPayment(p3).prevPaymentId, p2);
        assertEq(router.getPayment(p2).prevPaymentId, p1);
    }

    // ------------------------------------------------ newest-first at various times

    function test_Perm_NewestFirst_AtStart() public {
        _refundExpect(p3, 30e6, T0 + 60 days);
        _assertSub(T0 + 60 days, 20e6, 20e6);
        _refundExpect(p2, 20e6, T0 + 30 days);
        _assertSub(T0 + 30 days, 10e6, 10e6);
        _refundExpect(p1, 10e6, T0);
        _assertSub(T0, 0, 0);
        assertEq(address(router).balance, 0);
    }

    function test_Perm_NewestFirst_MidSecondPeriod() public {
        vm.warp(T0 + 45 days);
        _refundExpect(p3, 30e6, T0 + 60 days);
        _assertSub(T0 + 60 days, 20e6, 20e6);
        // P2 still running (ends +60d) -> rollback to its start (+30d, already past)
        _refundExpect(p2, 20e6, T0 + 30 days);
        _assertSub(T0 + 30 days, 10e6, 0);
        // P1 fully elapsed -> expiry untouched
        _refundExpect(p1, 10e6, T0 + 30 days);
        _assertSub(T0 + 30 days, 0, 0);
    }

    function test_Perm_NewestFirst_MidThirdPeriod() public {
        vm.warp(T0 + 75 days);
        _refundExpect(p3, 30e6, T0 + 60 days);
        _assertSub(T0 + 60 days, 20e6, 0);
        _refundExpect(p2, 20e6, T0 + 60 days);
        _assertSub(T0 + 60 days, 10e6, 0);
        _refundExpect(p1, 10e6, T0 + 60 days);
        _assertSub(T0 + 60 days, 0, 0);
    }

    function test_Perm_NewestFirst_AllElapsed() public {
        vm.warp(T0 + 100 days);
        _refundExpect(p3, 30e6, T0 + 90 days);
        _assertSub(T0 + 90 days, 20e6, 0);
        _refundExpect(p2, 20e6, T0 + 90 days);
        _assertSub(T0 + 90 days, 10e6, 0);
        _refundExpect(p1, 10e6, T0 + 90 days);
        _assertSub(T0 + 90 days, 0, 0);
    }

    function test_Perm_ExactBoundary_PeriodEndEqualsNowCountsAsElapsed() public {
        vm.warp(T0 + 30 days);
        // P1 ended exactly now -> elapsed -> refundable out of order, expiry unchanged
        _refundExpect(p1, 10e6, T0 + 90 days);
        _assertSub(T0 + 90 days, 30e6, 30e6);
    }

    // ------------------------------------------------ RefundNewerFirst

    function test_Perm_OlderNonElapsedWhileNewerExists_Reverts() public {
        _expectRefundRevert(p1, RevenueRouter.RefundNewerFirst.selector);
        _expectRefundRevert(p2, RevenueRouter.RefundNewerFirst.selector);
        assertFalse(router.getPayment(p1).refunded);
        assertFalse(router.getPayment(p2).refunded);
        _assertSub(T0 + 90 days, 30e6, 30e6);

        _refund(p3);
        _expectRefundRevert(p1, RevenueRouter.RefundNewerFirst.selector);
        _refund(p2);
        _refund(p1);
        _assertSub(T0, 0, 0);
    }

    function test_Perm_OlderElapsedOk_OlderNonElapsedReverts() public {
        vm.warp(T0 + 45 days);
        _expectRefundRevert(p2, RevenueRouter.RefundNewerFirst.selector); // P2 not elapsed, P3 exists
        _refundExpect(p1, 10e6, T0 + 90 days); // P1 elapsed -> fine, expiry unchanged
        _assertSub(T0 + 90 days, 30e6, 30e6);

        _refund(p3);
        _assertSub(T0 + 60 days, 20e6, 20e6);
        _refundExpect(p2, 20e6, T0 + 30 days);
        // P2's predecessor P1 is already refunded -> nothing earlier is paid for
        _assertSub(T0 + 30 days, 0, 0);
    }

    // ------------------------------------------------ elapsed periods in any order

    function test_Perm_Elapsed_AnyOrder_ExpiryUnchanged() public {
        vm.warp(T0 + 65 days); // P1, P2 elapsed; P3 still running (ends +90d)
        _refundExpect(p2, 20e6, T0 + 90 days);
        _assertSub(T0 + 90 days, 30e6, 30e6);
        _refundExpect(p1, 10e6, T0 + 90 days);
        _assertSub(T0 + 90 days, 30e6, 30e6);
        assertTrue(router.isSubscriptionActive(monthlyId, alice));
        // Now the live one: rolls back to P3 start, skipping refunded P2/P1
        _refundExpect(p3, 30e6, T0 + 60 days);
        _assertSub(T0 + 60 days, 0, 0);
    }

    function test_Perm_Elapsed_OldestFirstOrder() public {
        vm.warp(T0 + 100 days);
        _refundExpect(p1, 10e6, T0 + 90 days);
        _refundExpect(p2, 20e6, T0 + 90 days);
        _assertSub(T0 + 90 days, 30e6, 0);
        _refundExpect(p3, 30e6, T0 + 90 days);
        _assertSub(T0 + 90 days, 0, 0);
    }

    function test_Perm_Elapsed_MiddleFirstOrder() public {
        vm.warp(T0 + 100 days);
        _refundExpect(p2, 20e6, T0 + 90 days);
        _assertSub(T0 + 90 days, 30e6, 0);
        _refundExpect(p3, 30e6, T0 + 90 days);
        // P3 refunded; its predecessor P2 is refunded, so latest paid is P1
        _assertSub(T0 + 90 days, 10e6, 0);
        _refundExpect(p1, 10e6, T0 + 90 days);
        _assertSub(T0 + 90 days, 0, 0);
    }

    // ------------------------------------------------ after refunding everything

    function test_Perm_AllRefunded_SubscriptionInactiveAndMrrZero() public {
        vm.warp(T0 + 10 days);
        _refund(p3);
        _refund(p2);
        _refund(p1);
        assertFalse(router.isSubscriptionActive(monthlyId, alice));
        assertEq(router.mrr(merchantId), 0);
        (uint256 total, uint256 count,) = router.mrrPage(merchantId, 0, 10);
        assertEq(total, 0);
        assertEq(count, 0);
        _assertSub(T0, 0, 0);
        assertTrue(router.getPayment(p1).refunded);
        assertTrue(router.getPayment(p2).refunded);
        assertTrue(router.getPayment(p3).refunded);
    }

    function test_Perm_AllRefundedAndFundsReturned() public {
        uint256 aliceBefore = alice.balance;
        _refund(p3);
        _refund(p2);
        _refund(p1);
        assertEq(alice.balance, aliceBefore + 60e6 * U);
        assertEq(address(router).balance, 0);
    }

    // ------------------------------------------------ mrr amount after rollback

    function test_Perm_MrrUsesLatestNonRefundedAmountAfterRollback() public {
        vm.warp(T0 + 10 days);
        assertEq(router.mrr(merchantId), 30e6);
        _refund(p3);
        assertEq(router.mrr(merchantId), 20e6);
        _refund(p2);
        assertEq(router.mrr(merchantId), 10e6);
        (uint256 total, uint256 count,) = router.mrrPage(merchantId, 0, 10);
        assertEq(total, 10e6);
        assertEq(count, 1);
    }

    function test_Perm_AmountSkipsRefundedMiddlePayment() public {
        vm.warp(T0 + 65 days);
        _refund(p2); // elapsed, not latest
        _refund(p3); // latest, running -> rollback; P2 is refunded so latest paid is P1
        (uint64 until, uint128 amount) = router.subscriptionOf(monthlyId, alice);
        assertEq(until, T0 + 60 days);
        assertEq(amount, 10e6);
        assertEq(router.mrr(merchantId), 0, "expired so not counted");
    }

    function test_Perm_ResubscribeAfterPartialRefund_ExtendsFromRolledBackExpiry() public {
        vm.warp(T0 + 10 days);
        _refund(p3); // until = +60d
        uint256 p4 = _pay(alice, monthlyId); // price now 30e6
        assertEq(router.getPayment(p4).periodStart, T0 + 60 days);
        assertEq(router.getPayment(p4).periodEnd, T0 + 90 days);
        assertEq(router.getPayment(p4).prevPaymentId, p2);
        _assertSub(T0 + 90 days, 30e6, 30e6);
    }

    function test_Perm_ResubscribeAfterFullRefund_StartsFromNow() public {
        vm.warp(T0 + 10 days);
        _refund(p3);
        _refund(p2);
        _refund(p1);
        uint256 p4 = _pay(alice, monthlyId);
        assertEq(router.getPayment(p4).prevPaymentId, 0);
        _assertSub(T0 + 10 days + PERIOD, 30e6, 30e6);
    }

    function test_Perm_DoubleRefundStillReverts_AndStateUnchanged() public {
        _refund(p3);
        _expectRefundRevert(p3, RevenueRouter.AlreadyRefunded.selector);
        _assertSub(T0 + 60 days, 20e6, 20e6);
    }

    function test_Perm_OtherPayersUnaffectedByRefund() public {
        uint256 bobPay = _pay(bob, monthlyId);
        _refund(p3);
        _refund(p2);
        _refund(p1);
        (uint64 until, uint128 amount) = router.subscriptionOf(monthlyId, bob);
        assertEq(until, T0 + PERIOD);
        assertEq(amount, 30e6);
        assertEq(router.mrr(merchantId), 30e6);
        assertFalse(router.getPayment(bobPay).refunded);
    }
}
