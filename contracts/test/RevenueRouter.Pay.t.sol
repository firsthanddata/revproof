// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {RevenueRouterTestBase} from "./RevenueRouter.Base.t.sol";
import {RevenueRouter, RevenueRouterTypes} from "../RevenueRouter.sol";
import {RejectingReceiver, ReentrantReceiver} from "../test-helpers/RouterHelpers.sol";

contract RevenueRouterPayTest is RevenueRouterTestBase {
    // ---------------------------------------------------------------- (3) pay

    function test_Pay_ForwardsFundsToPayoutInSameTx() public {
        uint256 v = _value(monthlyId);
        uint256 payoutBefore = payout.balance;
        uint256 aliceBefore = alice.balance;
        assertEq(address(router).balance, 0);

        _pay(alice, monthlyId);

        assertEq(payout.balance, payoutBefore + v);
        assertEq(alice.balance, aliceBefore - v);
        assertEq(address(router).balance, 0);
        assertEq(v, uint256(MONTHLY_PRICE) * 1e12);
    }

    function test_Pay_OneTimeForwardsFunds() public {
        uint256 v = _value(oneTimeId);
        uint256 payoutBefore = payout.balance;
        _pay(bob, oneTimeId);
        assertEq(payout.balance, payoutBefore + v);
        assertEq(address(router).balance, 0);
    }

    function test_Pay_EmitsPaymentEvent_Monthly() public {
        uint256 v = _value(monthlyId);
        vm.expectEmit(true, true, true, true, address(router));
        emit RevenueRouter.Payment(
            merchantId, monthlyId, alice, 1, MONTHLY_PRICE, uint64(T0), uint64(T0 + PERIOD), REF
        );
        vm.prank(alice);
        uint256 id = router.pay{value: v}(monthlyId, REF);
        assertEq(id, 1);
    }

    function test_Pay_EmitsPaymentEvent_OneTimeHasZeroPaidUntil() public {
        bytes32 ref = keccak256("custom");
        vm.warp(T0 + 123);
        uint256 v = _value(oneTimeId);
        vm.expectEmit(true, true, true, true, address(router));
        emit RevenueRouter.Payment(merchantId, oneTimeId, bob, 1, ONETIME_PRICE, uint64(T0 + 123), 0, ref);
        vm.prank(bob);
        router.pay{value: v}(oneTimeId, ref);
    }

    function test_Pay_StoresPaymentRecord() public {
        vm.warp(T0 + 77);
        uint256 id = _pay(alice, monthlyId);
        RevenueRouterTypes.Payment memory p = router.getPayment(id);
        assertEq(p.productId, monthlyId);
        assertEq(p.payer, alice);
        assertEq(p.amount, MONTHLY_PRICE);
        assertEq(p.periodStart, T0 + 77);
        assertEq(p.periodEnd, T0 + 77 + PERIOD);
        assertFalse(p.refunded);
        assertEq(p.prevPaymentId, 0);
        assertEq(router.paymentCount(), 1);
    }

    function test_Pay_PaymentIdsSequential() public {
        assertEq(_pay(alice, monthlyId), 1);
        assertEq(_pay(bob, oneTimeId), 2);
        assertEq(_pay(alice, oneTimeId), 3);
        assertEq(router.paymentCount(), 3);
    }

    function test_GetPayment_UnknownReverts() public {
        vm.expectRevert(RevenueRouter.PaymentNotFound.selector);
        router.getPayment(1);
    }

    function test_Pay_WrongValueReverts() public {
        uint256 v = _value(monthlyId);
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(RevenueRouter.IncorrectNativeValue.selector, v, v - 1));
        router.pay{value: v - 1}(monthlyId, REF);
        vm.expectRevert(abi.encodeWithSelector(RevenueRouter.IncorrectNativeValue.selector, v, v + 1));
        router.pay{value: v + 1}(monthlyId, REF);
        vm.expectRevert(abi.encodeWithSelector(RevenueRouter.IncorrectNativeValue.selector, v, 0));
        router.pay{value: 0}(monthlyId, REF);
        // 6-decimal amount sent as-is (forgetting the 1e12 scaling) must fail
        vm.expectRevert(abi.encodeWithSelector(RevenueRouter.IncorrectNativeValue.selector, v, uint256(MONTHLY_PRICE)));
        router.pay{value: MONTHLY_PRICE}(monthlyId, REF);
        vm.stopPrank();
        assertEq(router.paymentCount(), 0);
        assertEq(address(router).balance, 0);
    }

    function test_Pay_UnknownProductReverts() public {
        vm.startPrank(alice);
        vm.expectRevert(RevenueRouter.ProductNotFound.selector);
        router.pay{value: 1e18}(99, REF);
        vm.expectRevert(RevenueRouter.ProductNotFound.selector);
        router.pay{value: 1e18}(0, REF);
        vm.stopPrank();
    }

    function test_Pay_RejectingPayoutRevertsAtomically() public {
        RejectingReceiver rej = new RejectingReceiver();
        vm.prank(owner);
        router.setPayout(merchantId, address(rej));

        uint256 v = _value(monthlyId);
        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        vm.expectRevert(RevenueRouter.NativeTransferFailed.selector);
        router.pay{value: v}(monthlyId, REF);

        assertEq(alice.balance, aliceBefore);
        assertEq(address(router).balance, 0);
        assertEq(address(rej).balance, 0);
        assertEq(router.paymentCount(), 0);
        (uint64 until,) = router.subscriptionOf(monthlyId, alice);
        assertEq(until, 0);
        assertEq(router.subscriptionCount(merchantId), 0);
        assertEq(router.mrr(merchantId), 0);
    }

    function test_Pay_ReentrantPayoutCannotReenterPayOrRefund() public {
        ReentrantReceiver rr = new ReentrantReceiver(router);
        vm.prank(owner);
        router.setPayout(merchantId, address(rr));
        // payment 1 will be the one-time payment below; arm to re-enter with it
        rr.arm(oneTimeId, 1);

        uint256 v = _value(oneTimeId);
        vm.prank(alice);
        router.pay{value: v}(oneTimeId, REF);

        assertEq(rr.receiveCount(), 1);
        assertFalse(rr.payOk(), "reentrant pay must fail");
        assertFalse(rr.refundOk(), "reentrant refund must fail");
        bytes memory guard = abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(rr.payRevertData(), guard);
        assertEq(rr.refundRevertData(), guard);
        // outer payment completed; funds sit with the payout, not the router
        assertEq(router.paymentCount(), 1);
        assertEq(address(rr).balance, v);
        assertEq(address(router).balance, 0);
        assertFalse(router.getPayment(1).refunded);
    }

    function test_Pay_ContractPayerWorks() public {
        ReentrantReceiver rr = new ReentrantReceiver(router);
        vm.deal(address(rr), 1e24);
        uint256 v = _value(monthlyId);
        uint256 payoutBefore = payout.balance;
        uint256 id = rr.payThrough{value: v}(monthlyId, REF);
        assertEq(router.getPayment(id).payer, address(rr));
        assertEq(payout.balance, payoutBefore + v);
        assertEq(address(router).balance, 0);
    }

    // ---------------------------------------------------------------- (7) pause

    function test_Pause_PausedProductCannotBePaid() public {
        vm.expectEmit(true, false, false, true, address(router));
        emit RevenueRouter.ProductStatusChanged(monthlyId, false);
        vm.prank(owner);
        router.setProductActive(monthlyId, false);
        assertFalse(router.getProduct(monthlyId).active);

        uint256 v = _value(monthlyId);
        vm.prank(alice);
        vm.expectRevert(RevenueRouter.ProductPaused.selector);
        router.pay{value: v}(monthlyId, REF);
        // sibling product unaffected
        _pay(alice, oneTimeId);
    }

    function test_Pause_UnpauseWorks() public {
        vm.startPrank(owner);
        router.setProductActive(monthlyId, false);
        vm.expectEmit(true, false, false, true, address(router));
        emit RevenueRouter.ProductStatusChanged(monthlyId, true);
        router.setProductActive(monthlyId, true);
        vm.stopPrank();
        assertTrue(router.getProduct(monthlyId).active);
        _pay(alice, monthlyId);
        assertTrue(router.isSubscriptionActive(monthlyId, alice));
    }

    function test_Pause_OnlyOwnerCanPause() public {
        vm.prank(stranger);
        vm.expectRevert(RevenueRouter.Unauthorized.selector);
        router.setProductActive(monthlyId, false);
        vm.prank(payout);
        vm.expectRevert(RevenueRouter.Unauthorized.selector);
        router.setProductActive(monthlyId, false);
        vm.prank(stranger);
        vm.expectRevert(RevenueRouter.ProductNotFound.selector);
        router.setProductActive(99, false);
    }

    function test_Pause_ExistingSubscriptionUnaffected() public {
        _pay(alice, monthlyId);
        (uint64 untilBefore,) = router.subscriptionOf(monthlyId, alice);
        vm.prank(owner);
        router.setProductActive(monthlyId, false);

        assertTrue(router.isSubscriptionActive(monthlyId, alice));
        (uint64 untilAfter, uint128 amount) = router.subscriptionOf(monthlyId, alice);
        assertEq(untilAfter, untilBefore);
        assertEq(amount, MONTHLY_PRICE);
        assertEq(router.mrr(merchantId), MONTHLY_PRICE);

        // still expires on schedule
        vm.warp(untilBefore);
        assertFalse(router.isSubscriptionActive(monthlyId, alice));
    }

    function test_Pause_RenewalBlockedWhilePausedButSubKept() public {
        _pay(alice, monthlyId);
        vm.prank(owner);
        router.setProductActive(monthlyId, false);
        uint256 v = _value(monthlyId);
        vm.prank(alice);
        vm.expectRevert(RevenueRouter.ProductPaused.selector);
        router.pay{value: v}(monthlyId, REF);
        (uint64 until,) = router.subscriptionOf(monthlyId, alice);
        assertEq(until, T0 + PERIOD);
    }
}
