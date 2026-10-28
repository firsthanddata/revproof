// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {RevenueRouterTestBase} from "./RevenueRouter.Base.t.sol";
import {RevenueRouter} from "../RevenueRouter.sol";
import {RejectingReceiver, ReentrantReceiver} from "../test-helpers/RouterHelpers.sol";

contract RevenueRouterRefundTest is RevenueRouterTestBase {
    function test_Refund_OneTime_ForwardsExactValueToPayer() public {
        uint256 id = _pay(alice, oneTimeId);
        uint256 v = uint256(ONETIME_PRICE) * U;
        uint256 aliceBefore = alice.balance;
        uint256 ownerBefore = owner.balance;
        uint256 payoutBefore = payout.balance;

        _refund(id);

        assertEq(alice.balance, aliceBefore + v);
        assertEq(owner.balance, ownerBefore - v);
        assertEq(payout.balance, payoutBefore, "payout untouched by refund");
        assertEq(address(router).balance, 0);
        assertTrue(router.getPayment(id).refunded);
    }

    function test_Refund_EmitsRefundEvent_OneTime() public {
        uint256 id = _pay(alice, oneTimeId);
        vm.warp(T0 + 500);
        uint256 v = uint256(ONETIME_PRICE) * U;
        vm.expectEmit(true, true, true, true, address(router));
        emit RevenueRouter.Refund(merchantId, oneTimeId, alice, id, ONETIME_PRICE, uint64(T0 + 500), 0);
        vm.prank(owner);
        router.refund{value: v}(id);
    }

    function test_Refund_EmitsRefundEvent_Monthly() public {
        uint256 id = _pay(alice, monthlyId);
        vm.warp(T0 + 10 days);
        uint256 v = uint256(MONTHLY_PRICE) * U;
        // single period refunded mid-way: expiry rolls back to period start (T0)
        vm.expectEmit(true, true, true, true, address(router));
        emit RevenueRouter.Refund(merchantId, monthlyId, alice, id, MONTHLY_PRICE, uint64(T0 + 10 days), uint64(T0));
        vm.prank(owner);
        router.refund{value: v}(id);
        assertFalse(router.isSubscriptionActive(monthlyId, alice));
        assertEq(router.mrr(merchantId), 0);
    }

    function test_Refund_OnlyMerchantOwner() public {
        uint256 id = _pay(alice, oneTimeId);
        uint256 v = uint256(ONETIME_PRICE) * U;
        vm.prank(stranger);
        vm.expectRevert(RevenueRouter.Unauthorized.selector);
        router.refund{value: v}(id);
        vm.prank(payout);
        vm.expectRevert(RevenueRouter.Unauthorized.selector);
        router.refund{value: v}(id);
        vm.prank(alice);
        vm.expectRevert(RevenueRouter.Unauthorized.selector);
        router.refund{value: v}(id);
        assertFalse(router.getPayment(id).refunded);
    }

    function test_Refund_UnknownPaymentReverts() public {
        vm.prank(owner);
        vm.expectRevert(RevenueRouter.PaymentNotFound.selector);
        router.refund{value: 1e18}(42);
    }

    function test_Refund_DoubleRefundReverts() public {
        uint256 id = _pay(alice, oneTimeId);
        _refund(id);
        _expectRefundRevert(id, RevenueRouter.AlreadyRefunded.selector);
    }

    function test_Refund_WrongValueReverts() public {
        uint256 id = _pay(alice, oneTimeId);
        uint256 v = uint256(ONETIME_PRICE) * U;
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(RevenueRouter.IncorrectNativeValue.selector, v, v - 1));
        router.refund{value: v - 1}(id);
        vm.expectRevert(abi.encodeWithSelector(RevenueRouter.IncorrectNativeValue.selector, v, v + 1));
        router.refund{value: v + 1}(id);
        vm.expectRevert(abi.encodeWithSelector(RevenueRouter.IncorrectNativeValue.selector, v, 0));
        router.refund(id);
        vm.stopPrank();
        assertFalse(router.getPayment(id).refunded);
    }

    function test_Refund_UsesOriginalAmountNotCurrentPrice() public {
        uint256 id = _pay(alice, oneTimeId);
        vm.prank(owner);
        router.updateProduct(oneTimeId, "Ebook", 9e6);
        uint256 aliceBefore = alice.balance;
        _refund(id); // _refund uses the payment's stored amount
        assertEq(alice.balance, aliceBefore + uint256(ONETIME_PRICE) * U);
        // a payment made at the new price (9e6) needs 9e6 to refund, not the old 5e6
        uint256 id2 = _pay(alice, oneTimeId);
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(RevenueRouter.IncorrectNativeValue.selector, 9e6 * U, uint256(ONETIME_PRICE) * U)
        );
        router.refund{value: uint256(ONETIME_PRICE) * U}(id2);
    }

    function test_Refund_PayoutChangeDoesNotMatter() public {
        uint256 id = _pay(alice, oneTimeId);
        vm.prank(owner);
        router.setPayout(merchantId, bob);
        uint256 aliceBefore = alice.balance;
        uint256 bobBefore = bob.balance;
        uint256 oldPayout = payout.balance;
        _refund(id);
        assertEq(alice.balance, aliceBefore + uint256(ONETIME_PRICE) * U);
        assertEq(bob.balance, bobBefore);
        assertEq(payout.balance, oldPayout);
        assertEq(address(router).balance, 0);
    }

    function test_Refund_WorksWhileProductPaused() public {
        uint256 id = _pay(alice, monthlyId);
        vm.prank(owner);
        router.setProductActive(monthlyId, false);
        _refund(id);
        assertTrue(router.getPayment(id).refunded);
    }

    function test_Refund_OwnerChangeNotPossible_RefundStaysWithOriginalOwner() public {
        // a second merchant owner cannot refund another merchant's payment
        vm.prank(stranger);
        router.registerMerchant("Other", "other", bob);
        uint256 id = _pay(alice, oneTimeId);
        uint256 v = uint256(ONETIME_PRICE) * U;
        vm.prank(stranger);
        vm.expectRevert(RevenueRouter.Unauthorized.selector);
        router.refund{value: v}(id);
    }

    function test_Refund_RejectingPayerRevertsAtomically() public {
        ReentrantReceiver rr = new ReentrantReceiver(router);
        vm.deal(address(rr), 1e24);
        uint256 id = rr.payThrough{value: uint256(MONTHLY_PRICE) * U}(monthlyId, REF);
        // Swap code to a rejecting one at the payer address
        RejectingReceiver rej = new RejectingReceiver();
        vm.etch(address(rr), address(rej).code);

        uint256 v = uint256(MONTHLY_PRICE) * U;
        uint256 ownerBefore = owner.balance;
        vm.prank(owner);
        vm.expectRevert(RevenueRouter.NativeTransferFailed.selector);
        router.refund{value: v}(id);

        assertEq(owner.balance, ownerBefore);
        assertFalse(router.getPayment(id).refunded);
        assertTrue(router.isSubscriptionActive(monthlyId, address(rr)));
        assertEq(router.mrr(merchantId), MONTHLY_PRICE);
        assertEq(address(router).balance, 0);
    }

    function test_Refund_ReentrantPayerCannotReenter() public {
        ReentrantReceiver rr = new ReentrantReceiver(router);
        vm.deal(address(rr), 1e24);
        uint256 id = rr.payThrough{value: uint256(ONETIME_PRICE) * U}(oneTimeId, REF);
        rr.arm(oneTimeId, id);

        _refund(id);

        assertEq(rr.receiveCount(), 1);
        assertFalse(rr.payOk());
        assertFalse(rr.refundOk());
        bytes memory guard = abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(rr.payRevertData(), guard);
        assertEq(rr.refundRevertData(), guard);
        assertTrue(router.getPayment(id).refunded);
        assertEq(router.paymentCount(), 1);
        assertEq(address(router).balance, 0);
    }
}
