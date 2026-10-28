// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {RevenueRouterTestBase} from "./RevenueRouter.Base.t.sol";
import {RevenueRouter} from "../RevenueRouter.sol";

contract RevenueRouterFuzzTest is RevenueRouterTestBase {
    function _newProduct(uint128 price, bool monthly) internal returns (uint256 id) {
        vm.prank(owner);
        id = router.createProduct(
            merchantId, "Fuzz", price, monthly ? RevenueRouter.Billing.Monthly : RevenueRouter.Billing.OneTime
        );
    }

    function testFuzz_PayExactValue_ForwardsAllAndLeavesNothing(uint128 price, bool monthly, bytes32 ref) public {
        price = uint128(bound(price, 1, router.MAX_PRICE()));
        uint256 id = _newProduct(price, monthly);
        uint256 v = uint256(price) * U;
        vm.deal(alice, v);
        uint256 payoutBefore = payout.balance;

        vm.prank(alice);
        router.pay{value: v}(id, ref);

        assertEq(payout.balance, payoutBefore + v);
        assertEq(alice.balance, 0);
        assertEq(address(router).balance, 0);
    }

    function testFuzz_PayWrongValue_Reverts(uint128 price, uint256 value) public {
        price = uint128(bound(price, 1, router.MAX_PRICE()));
        uint256 id = _newProduct(price, true);
        uint256 expected = uint256(price) * U;
        value = bound(value, 0, 2e27);
        vm.assume(value != expected);
        vm.deal(alice, value);
        uint256 payoutBefore = payout.balance;

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RevenueRouter.IncorrectNativeValue.selector, expected, value));
        router.pay{value: value}(id, REF);

        assertEq(payout.balance, payoutBefore);
        assertEq(alice.balance, value);
        assertEq(address(router).balance, 0);
        assertEq(router.paymentCount(), 0);
    }

    function testFuzz_PayThenRefund_NetZeroForPayerAndNoRouterBalance(uint128 price, bool monthly) public {
        price = uint128(bound(price, 1, router.MAX_PRICE()));
        uint256 id = _newProduct(price, monthly);
        uint256 v = uint256(price) * U;
        vm.deal(alice, v);
        vm.deal(owner, v);

        vm.prank(alice);
        uint256 pid = router.pay{value: v}(id, REF);
        vm.prank(owner);
        router.refund{value: v}(pid);

        assertEq(alice.balance, v);
        assertEq(owner.balance, 0);
        assertEq(address(router).balance, 0);
        assertFalse(router.isSubscriptionActive(id, alice));
        assertEq(router.mrr(merchantId), 0);
    }

    function testFuzz_MonthlyPaidUntil_MatchesMaxOfNowAndExistingPlusPeriod(uint32 gap1, uint32 gap2) public {
        uint256 d1 = bound(gap1, 0, 120 days);
        uint256 d2 = bound(gap2, 0, 120 days);

        _pay(alice, monthlyId);
        uint256 until1 = T0 + PERIOD;
        vm.warp(T0 + d1);
        _pay(alice, monthlyId);
        uint256 start2 = block.timestamp > until1 ? block.timestamp : until1;
        uint256 until2 = start2 + PERIOD;
        (uint64 u,) = router.subscriptionOf(monthlyId, alice);
        assertEq(u, until2);

        vm.warp(block.timestamp + d2);
        _pay(alice, monthlyId);
        uint256 start3 = block.timestamp > until2 ? block.timestamp : until2;
        (u,) = router.subscriptionOf(monthlyId, alice);
        assertEq(u, start3 + PERIOD);
        assertEq(router.isSubscriptionActive(monthlyId, alice), true);
        assertEq(router.mrr(merchantId), MONTHLY_PRICE);
        assertEq(address(router).balance, 0);
    }

    function testFuzz_MrrZeroOnceAllPeriodsLapse(uint8 n, uint32 extra) public {
        uint256 count = bound(n, 1, 6);
        for (uint256 i; i < count; ++i) {
            _pay(alice, monthlyId);
        }
        assertEq(router.mrr(merchantId), MONTHLY_PRICE);
        vm.warp(T0 + count * PERIOD + bound(extra, 0, 365 days));
        assertEq(router.mrr(merchantId), 0);
        (uint256 total, uint256 active,) = router.mrrPage(merchantId, 0, 100);
        assertEq(total, 0);
        assertEq(active, 0);
    }
}
