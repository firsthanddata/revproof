// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {RevenueRouterTestBase} from "./RevenueRouter.Base.t.sol";
import {RevenueRouter, RevenueRouterTypes} from "../RevenueRouter.sol";

contract RevenueRouterSubscriptionTest is RevenueRouterTestBase {
    uint256 internal teamId;

    function setUp() public override {
        super.setUp();
        vm.prank(owner);
        teamId = router.createProduct(merchantId, "Team", 40e6, RevenueRouter.Billing.Monthly);
    }

    // ---------------------------------------------------------------- (4) paid-until logic

    function test_Monthly_FirstPaymentIsNowPlus30Days() public {
        _pay(alice, monthlyId);
        (uint64 until, uint128 amount) = router.subscriptionOf(monthlyId, alice);
        assertEq(until, T0 + 30 days);
        assertEq(amount, MONTHLY_PRICE);
        assertTrue(router.isSubscriptionActive(monthlyId, alice));
        assertEq(router.subscriptionCount(merchantId), 1);
    }

    function test_Monthly_EarlyRenewalExtendsFromExistingPaidUntil() public {
        _pay(alice, monthlyId);
        vm.warp(T0 + 10 days);
        uint256 v = _value(monthlyId);
        vm.expectEmit(true, true, true, true, address(router));
        emit RevenueRouter.Payment(
            merchantId, monthlyId, alice, 2, MONTHLY_PRICE, uint64(T0 + 10 days), uint64(T0 + 60 days), REF
        );
        vm.prank(alice);
        router.pay{value: v}(monthlyId, REF);
        (uint64 until,) = router.subscriptionOf(monthlyId, alice);
        assertEq(until, T0 + 60 days);
        // payment record links back to previous payment
        RevenueRouterTypes.Payment memory p2 = router.getPayment(2);
        assertEq(p2.periodStart, T0 + 30 days);
        assertEq(p2.periodEnd, T0 + 60 days);
        assertEq(p2.prevPaymentId, 1);
    }

    function test_Monthly_RenewalAtExactExpiryStartsFromNow() public {
        _pay(alice, monthlyId);
        vm.warp(T0 + 30 days);
        assertFalse(router.isSubscriptionActive(monthlyId, alice), "expired at boundary");
        _pay(alice, monthlyId);
        (uint64 until,) = router.subscriptionOf(monthlyId, alice);
        assertEq(until, T0 + 60 days);
    }

    function test_Monthly_RenewalAfterExpiryRestartsFromNow() public {
        _pay(alice, monthlyId);
        vm.warp(T0 + 45 days);
        assertFalse(router.isSubscriptionActive(monthlyId, alice));
        _pay(alice, monthlyId);
        (uint64 until,) = router.subscriptionOf(monthlyId, alice);
        assertEq(until, T0 + 45 days + PERIOD);
        assertTrue(router.isSubscriptionActive(monthlyId, alice));
        assertEq(router.subscriptionCount(merchantId), 1, "renewal does not relist");
    }

    function test_Monthly_MultipleEarlyRenewalsStack() public {
        _pay(alice, monthlyId);
        _pay(alice, monthlyId);
        _pay(alice, monthlyId);
        (uint64 until,) = router.subscriptionOf(monthlyId, alice);
        assertEq(until, T0 + 90 days);
    }

    function test_Monthly_SubscriptionsAreIndependentPerPayerAndProduct() public {
        _pay(alice, monthlyId);
        vm.warp(T0 + 5 days);
        _pay(bob, monthlyId);
        _pay(alice, teamId);
        (uint64 a,) = router.subscriptionOf(monthlyId, alice);
        (uint64 b,) = router.subscriptionOf(monthlyId, bob);
        (uint64 at,) = router.subscriptionOf(teamId, alice);
        assertEq(a, T0 + 30 days);
        assertEq(b, T0 + 5 days + PERIOD);
        assertEq(at, T0 + 5 days + PERIOD);
        assertEq(router.subscriptionCount(merchantId), 3);
        assertFalse(router.isSubscriptionActive(teamId, bob));
    }

    function test_OneTime_EmitsZeroPaidUntilAndCreatesNoSubscription() public {
        uint256 v = _value(oneTimeId);
        vm.expectEmit(true, true, true, true, address(router));
        emit RevenueRouter.Payment(merchantId, oneTimeId, alice, 1, ONETIME_PRICE, uint64(T0), 0, REF);
        vm.prank(alice);
        router.pay{value: v}(oneTimeId, REF);

        (uint64 until, uint128 amount) = router.subscriptionOf(oneTimeId, alice);
        assertEq(until, 0);
        assertEq(amount, 0);
        assertFalse(router.isSubscriptionActive(oneTimeId, alice));
        assertEq(router.subscriptionCount(merchantId), 0);
        RevenueRouterTypes.Payment memory p = router.getPayment(1);
        assertEq(p.periodStart, 0);
        assertEq(p.periodEnd, 0);
        assertEq(router.mrr(merchantId), 0);
    }

    function test_OneTime_RepeatPurchasesAllowed() public {
        _pay(alice, oneTimeId);
        _pay(alice, oneTimeId);
        assertEq(router.paymentCount(), 2);
        assertEq(router.subscriptionCount(merchantId), 0);
    }

    function test_SubscriptionViews_UnknownProductReverts() public {
        vm.expectRevert(RevenueRouter.ProductNotFound.selector);
        router.subscriptionOf(99, alice);
        vm.expectRevert(RevenueRouter.ProductNotFound.selector);
        router.isSubscriptionActive(99, alice);
        vm.expectRevert(RevenueRouter.MerchantNotFound.selector);
        router.subscriptionCount(99);
    }

    // ---------------------------------------------------------------- (5) MRR

    function test_Mrr_EmptyIsZero() public view {
        assertEq(router.mrr(merchantId), 0);
    }

    function test_Mrr_UnknownMerchantReverts() public {
        vm.expectRevert(RevenueRouter.MerchantNotFound.selector);
        router.mrr(99);
        vm.expectRevert(RevenueRouter.MerchantNotFound.selector);
        router.mrrPage(99, 0, 10);
    }

    function test_Mrr_CountsOnlyActiveMonthlySubs_ExcludesOneTime() public {
        _pay(alice, monthlyId);
        _pay(alice, oneTimeId);
        _pay(bob, oneTimeId);
        assertEq(router.mrr(merchantId), MONTHLY_PRICE);
    }

    function test_Mrr_MultipleSubscribersAndProducts() public {
        _pay(alice, monthlyId);
        _pay(bob, monthlyId);
        _pay(carol, teamId);
        _pay(alice, teamId);
        assertEq(router.mrr(merchantId), 10e6 + 10e6 + 40e6 + 40e6);
        (uint256 total, uint256 count, uint256 next) = router.mrrPage(merchantId, 0, 100);
        assertEq(total, 100e6);
        assertEq(count, 4);
        assertEq(next, 4);
    }

    function test_Mrr_RenewalDoesNotDoubleCount() public {
        _pay(alice, monthlyId);
        _pay(alice, monthlyId);
        assertEq(router.mrr(merchantId), MONTHLY_PRICE);
    }

    function test_Mrr_UsesLatestPaymentAmountAfterPriceChange() public {
        _pay(alice, monthlyId);
        _setPrice(monthlyId, 25e6);
        _pay(alice, monthlyId);
        assertEq(router.mrr(merchantId), 25e6);
    }

    function test_Mrr_ExcludesExpiredPlansAndDropsToZero() public {
        _pay(alice, monthlyId);
        vm.warp(T0 + 20 days);
        _pay(bob, monthlyId);
        _pay(carol, teamId);
        assertEq(router.mrr(merchantId), 60e6);

        vm.warp(T0 + 30 days); // alice expires exactly now
        assertEq(router.mrr(merchantId), 50e6);

        vm.warp(T0 + 20 days + PERIOD); // everyone expired
        assertEq(router.mrr(merchantId), 0);
        (uint256 total, uint256 count,) = router.mrrPage(merchantId, 0, 100);
        assertEq(total, 0);
        assertEq(count, 0);
    }

    function test_Mrr_RenewalAfterExpiryRestoresIt() public {
        _pay(alice, monthlyId);
        vm.warp(T0 + 31 days);
        assertEq(router.mrr(merchantId), 0);
        _pay(alice, monthlyId);
        assertEq(router.mrr(merchantId), MONTHLY_PRICE);
    }

    function test_Mrr_IsPerMerchant() public {
        vm.prank(stranger);
        uint256 m2 = router.registerMerchant("Other", "other", bob);
        vm.prank(stranger);
        uint256 other = router.createProduct(m2, "O", 7e6, RevenueRouter.Billing.Monthly);
        _pay(alice, other);
        _pay(alice, monthlyId);
        assertEq(router.mrr(m2), 7e6);
        assertEq(router.mrr(merchantId), MONTHLY_PRICE);
    }

    function _fourSubs() internal {
        _pay(alice, monthlyId); // idx0 10
        _pay(bob, monthlyId); //   idx1 10
        _pay(carol, teamId); //    idx2 40
        _pay(alice, teamId); //    idx3 40
    }

    function test_MrrPage_PaginationMatchesMrr() public {
        _fourSubs();
        uint256 expected = router.mrr(merchantId);
        for (uint256 size = 1; size <= 5; ++size) {
            uint256 offset;
            uint256 sum;
            uint256 cnt;
            uint256 guard;
            uint256 len = router.subscriptionCount(merchantId);
            while (offset < len && guard++ < 10) {
                (uint256 m, uint256 c, uint256 next) = router.mrrPage(merchantId, offset, size);
                sum += m;
                cnt += c;
                assertEq(next, offset + size > len ? len : offset + size);
                offset = next;
            }
            assertEq(sum, expected, "page sum == mrr");
            assertEq(cnt, 4);
        }
    }

    function test_MrrPage_PageContents() public {
        _fourSubs();
        (uint256 m, uint256 c, uint256 n) = router.mrrPage(merchantId, 0, 2);
        assertEq(m, 20e6);
        assertEq(c, 2);
        assertEq(n, 2);
        (m, c, n) = router.mrrPage(merchantId, 2, 2);
        assertEq(m, 80e6);
        assertEq(c, 2);
        assertEq(n, 4);
        (m, c, n) = router.mrrPage(merchantId, 3, 50);
        assertEq(m, 40e6);
        assertEq(c, 1);
        assertEq(n, 4);
    }

    function test_MrrPage_OffsetBeyondLengthAndZeroLimit() public {
        _fourSubs();
        (uint256 m, uint256 c, uint256 n) = router.mrrPage(merchantId, 4, 10);
        assertEq(m, 0);
        assertEq(c, 0);
        assertEq(n, 4);
        (m, c, n) = router.mrrPage(merchantId, 100, 10);
        assertEq(n, 4);
        (m, c, n) = router.mrrPage(merchantId, 1, 0);
        assertEq(m, 0);
        assertEq(c, 0);
        assertEq(n, 1, "zero limit makes no progress");
    }

    function test_MrrPage_SkipsExpiredEntriesWithinPage() public {
        _pay(alice, monthlyId); // idx0 expires T0+30d
        vm.warp(T0 + 10 days);
        _pay(bob, monthlyId); //   idx1 until T0+40d
        _pay(carol, teamId); //    idx2 until T0+40d
        vm.warp(T0 + 35 days);
        (uint256 m, uint256 c, uint256 n) = router.mrrPage(merchantId, 0, 3);
        assertEq(m, 50e6);
        assertEq(c, 2);
        assertEq(n, 3);
        assertEq(router.mrr(merchantId), 50e6);
        vm.warp(T0 + 41 days);
        assertEq(router.mrr(merchantId), 0);
    }
}
