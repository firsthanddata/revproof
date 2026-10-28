// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {RevenueRouterTestBase} from "./RevenueRouter.Base.t.sol";
import {RevenueRouter} from "../RevenueRouter.sol";

contract RevenueRouterMerchantTest is RevenueRouterTestBase {
    function _rep(bytes1 c, uint256 n) internal pure returns (string memory) {
        bytes memory b = new bytes(n);
        for (uint256 i; i < n; ++i) b[i] = c;
        return string(b);
    }

    // ---------------------------------------------------------------- (1) registerMerchant

    function test_RegisterMerchant_StoresFields() public {
        vm.prank(alice);
        uint256 id = router.registerMerchant("Beta Inc", "beta-inc", bob);
        assertEq(id, 2);
        assertEq(router.merchantCount(), 2);
        RevenueRouter.Merchant memory m = router.getMerchant(id);
        assertEq(m.owner, alice);
        assertEq(m.payout, bob);
        assertEq(m.name, "Beta Inc");
        assertEq(m.slug, "beta-inc");
        assertEq(router.merchantIdBySlug("beta-inc"), id);
        assertEq(router.merchantIdBySlug("acme"), merchantId);
    }

    function test_RegisterMerchant_EmitsEvent() public {
        vm.expectEmit(true, true, false, true, address(router));
        emit RevenueRouter.MerchantRegistered(2, alice, bob, "beta", "Beta");
        vm.prank(alice);
        router.registerMerchant("Beta", "beta", bob);
    }

    function test_RegisterMerchant_SameWalletCanRegisterMultiple() public {
        vm.startPrank(alice);
        uint256 a = router.registerMerchant("A", "aaa", bob);
        uint256 b = router.registerMerchant("B", "bbb", bob);
        vm.stopPrank();
        assertEq(b, a + 1);
    }

    function test_MerchantIdBySlug_UnknownIsZero() public view {
        assertEq(router.merchantIdBySlug("nobody"), 0);
        assertEq(router.merchantIdBySlug("ACME"), 0);
    }

    function test_GetMerchant_UnknownReverts() public {
        vm.expectRevert(RevenueRouter.MerchantNotFound.selector);
        router.getMerchant(99);
        vm.expectRevert(RevenueRouter.MerchantNotFound.selector);
        router.getMerchant(0);
    }

    function test_RegisterMerchant_SlugTooShortReverts() public {
        vm.expectRevert(RevenueRouter.InvalidSlug.selector);
        router.registerMerchant("Beta", "ab", bob);
    }

    function test_RegisterMerchant_SlugTooLongReverts() public {
        string memory s = _rep("a", 33);
        vm.expectRevert(RevenueRouter.InvalidSlug.selector);
        router.registerMerchant("Beta", s, bob);
    }

    function test_RegisterMerchant_SlugBoundaryLengthsAccepted() public {
        uint256 a = router.registerMerchant("Beta", "abc", bob);
        string memory s = _rep("a", 32);
        uint256 b = router.registerMerchant("Beta", s, bob);
        assertEq(router.merchantIdBySlug("abc"), a);
        assertEq(router.merchantIdBySlug(s), b);
    }

    function test_RegisterMerchant_SlugUppercaseReverts() public {
        vm.expectRevert(RevenueRouter.InvalidSlug.selector);
        router.registerMerchant("Beta", "Beta", bob);
    }

    function test_RegisterMerchant_SlugLeadingDashReverts() public {
        vm.expectRevert(RevenueRouter.InvalidSlug.selector);
        router.registerMerchant("Beta", "-beta", bob);
    }

    function test_RegisterMerchant_SlugTrailingDashReverts() public {
        vm.expectRevert(RevenueRouter.InvalidSlug.selector);
        router.registerMerchant("Beta", "beta-", bob);
    }

    function test_RegisterMerchant_SlugInvalidCharsRevert() public {
        vm.expectRevert(RevenueRouter.InvalidSlug.selector);
        router.registerMerchant("Beta", "be_ta", bob);
        vm.expectRevert(RevenueRouter.InvalidSlug.selector);
        router.registerMerchant("Beta", "be ta", bob);
    }

    function test_RegisterMerchant_InnerDashAndDigitsAccepted() public {
        uint256 id = router.registerMerchant("Beta", "b-3-ta", bob);
        assertEq(router.merchantIdBySlug("b-3-ta"), id);
    }

    function test_RegisterMerchant_DuplicateSlugReverts() public {
        vm.prank(alice);
        vm.expectRevert(RevenueRouter.SlugTaken.selector);
        router.registerMerchant("Other", "acme", bob);
    }

    function test_RegisterMerchant_ZeroPayoutReverts() public {
        vm.expectRevert(RevenueRouter.InvalidPayout.selector);
        router.registerMerchant("Beta", "beta", address(0));
    }

    function test_RegisterMerchant_RouterAsPayoutReverts() public {
        vm.expectRevert(RevenueRouter.InvalidPayout.selector);
        router.registerMerchant("Beta", "beta", address(router));
    }

    function test_RegisterMerchant_NameLengthBounds() public {
        vm.expectRevert(RevenueRouter.InvalidName.selector);
        router.registerMerchant("", "beta", bob);
        string memory tooLong = _rep("n", 65);
        vm.expectRevert(RevenueRouter.InvalidName.selector);
        router.registerMerchant(tooLong, "beta", bob);
        string memory ok = _rep("n", 64);
        uint256 id = router.registerMerchant(ok, "beta", bob);
        assertEq(router.getMerchant(id).name, ok);
    }

    // ---------------------------------------------------------------- (2) createProduct

    function test_CreateProduct_StoresFieldsAndEmits() public {
        vm.expectEmit(true, true, false, true, address(router));
        emit RevenueRouter.ProductCreated(merchantId, 3, "Team", 99e6, 1);
        vm.prank(owner);
        uint256 id = router.createProduct(merchantId, "Team", 99e6, RevenueRouter.Billing.Monthly);
        assertEq(id, 3);
        assertEq(router.productCount(), 3);
        RevenueRouter.Product memory p = router.getProduct(id);
        assertEq(p.merchantId, merchantId);
        assertEq(p.name, "Team");
        assertEq(p.price, 99e6);
        assertEq(uint8(p.billing), 1);
        assertTrue(p.active);
    }

    function test_CreateProduct_OneTimeBillingEventValue() public {
        vm.expectEmit(true, true, false, true, address(router));
        emit RevenueRouter.ProductCreated(merchantId, 3, "Once", 1, 0);
        vm.prank(owner);
        router.createProduct(merchantId, "Once", 1, RevenueRouter.Billing.OneTime);
    }

    function test_CreateProduct_PriceBounds() public {
        vm.startPrank(owner);
        vm.expectRevert(RevenueRouter.InvalidPrice.selector);
        router.createProduct(merchantId, "Free", 0, RevenueRouter.Billing.OneTime);
        uint128 max = router.MAX_PRICE();
        vm.expectRevert(RevenueRouter.InvalidPrice.selector);
        router.createProduct(merchantId, "Huge", max + 1, RevenueRouter.Billing.OneTime);
        uint256 a = router.createProduct(merchantId, "Min", 1, RevenueRouter.Billing.OneTime);
        uint256 b = router.createProduct(merchantId, "Max", max, RevenueRouter.Billing.OneTime);
        vm.stopPrank();
        assertEq(router.getProduct(a).price, 1);
        assertEq(router.getProduct(b).price, max);
    }

    function test_CreateProduct_NameLengthBounds() public {
        vm.startPrank(owner);
        vm.expectRevert(RevenueRouter.InvalidName.selector);
        router.createProduct(merchantId, "", 1, RevenueRouter.Billing.OneTime);
        string memory tooLong = _rep("n", 65);
        vm.expectRevert(RevenueRouter.InvalidName.selector);
        router.createProduct(merchantId, tooLong, 1, RevenueRouter.Billing.OneTime);
        vm.stopPrank();
    }

    function test_CreateProduct_UnknownMerchantReverts() public {
        vm.prank(owner);
        vm.expectRevert(RevenueRouter.MerchantNotFound.selector);
        router.createProduct(99, "X", 1, RevenueRouter.Billing.OneTime);
    }

    function test_CreateProduct_OnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(RevenueRouter.Unauthorized.selector);
        router.createProduct(merchantId, "X", 1, RevenueRouter.Billing.OneTime);
        // payout address is not the owner either
        vm.prank(payout);
        vm.expectRevert(RevenueRouter.Unauthorized.selector);
        router.createProduct(merchantId, "X", 1, RevenueRouter.Billing.OneTime);
    }

    function test_GetProduct_UnknownReverts() public {
        vm.expectRevert(RevenueRouter.ProductNotFound.selector);
        router.getProduct(99);
        vm.expectRevert(RevenueRouter.ProductNotFound.selector);
        router.getProduct(0);
    }

    function test_UpdateProduct_ChangesNameAndPriceKeepsBilling() public {
        vm.expectEmit(true, false, false, true, address(router));
        emit RevenueRouter.ProductUpdated(monthlyId, "Pro+", 12e6);
        vm.prank(owner);
        router.updateProduct(monthlyId, "Pro+", 12e6);
        RevenueRouter.Product memory p = router.getProduct(monthlyId);
        assertEq(p.name, "Pro+");
        assertEq(p.price, 12e6);
        assertEq(uint8(p.billing), uint8(RevenueRouter.Billing.Monthly), "billing immutable");
        assertEq(p.merchantId, merchantId);
        assertTrue(p.active);
    }

    function test_UpdateProduct_ValidationReverts() public {
        vm.startPrank(owner);
        vm.expectRevert(RevenueRouter.InvalidPrice.selector);
        router.updateProduct(monthlyId, "Pro", 0);
        uint128 max = router.MAX_PRICE();
        vm.expectRevert(RevenueRouter.InvalidPrice.selector);
        router.updateProduct(monthlyId, "Pro", max + 1);
        vm.expectRevert(RevenueRouter.InvalidName.selector);
        router.updateProduct(monthlyId, "", 1);
        vm.expectRevert(RevenueRouter.ProductNotFound.selector);
        router.updateProduct(99, "Pro", 1);
        vm.stopPrank();
    }

    function test_UpdateProduct_PriceChangeDoesNotAffectExistingSubscriptionAmount() public {
        _pay(alice, monthlyId);
        _setPrice(monthlyId, 50e6);
        (, uint128 amount) = router.subscriptionOf(monthlyId, alice);
        assertEq(amount, MONTHLY_PRICE);
        assertEq(router.mrr(merchantId), MONTHLY_PRICE);
    }

    // ---------------------------------------------------------------- (8) access control

    function test_OnlyOwner_UpdateProduct() public {
        vm.prank(stranger);
        vm.expectRevert(RevenueRouter.Unauthorized.selector);
        router.updateProduct(monthlyId, "Hack", 1);
        vm.prank(payout);
        vm.expectRevert(RevenueRouter.Unauthorized.selector);
        router.updateProduct(monthlyId, "Hack", 1);
    }

    function test_OnlyOwner_SetProductActive() public {
        vm.prank(stranger);
        vm.expectRevert(RevenueRouter.Unauthorized.selector);
        router.setProductActive(monthlyId, false);
        assertTrue(router.getProduct(monthlyId).active);
    }

    function test_OnlyOwner_SetPayout_AndHappyPath() public {
        vm.prank(stranger);
        vm.expectRevert(RevenueRouter.Unauthorized.selector);
        router.setPayout(merchantId, stranger);
        vm.prank(payout);
        vm.expectRevert(RevenueRouter.Unauthorized.selector);
        router.setPayout(merchantId, stranger);

        vm.expectEmit(true, false, false, true, address(router));
        emit RevenueRouter.MerchantUpdated(merchantId, bob, "Acme");
        vm.prank(owner);
        router.setPayout(merchantId, bob);
        assertEq(router.getMerchant(merchantId).payout, bob);
        assertEq(router.getMerchant(merchantId).owner, owner);
    }

    function test_SetPayout_InvalidReverts() public {
        vm.startPrank(owner);
        vm.expectRevert(RevenueRouter.InvalidPayout.selector);
        router.setPayout(merchantId, address(0));
        vm.expectRevert(RevenueRouter.InvalidPayout.selector);
        router.setPayout(merchantId, address(router));
        vm.expectRevert(RevenueRouter.MerchantNotFound.selector);
        router.setPayout(99, bob);
        vm.stopPrank();
    }

    function test_OnlyOwner_SetName_AndHappyPath() public {
        vm.prank(stranger);
        vm.expectRevert(RevenueRouter.Unauthorized.selector);
        router.setName(merchantId, "Hacked");

        vm.expectEmit(true, false, false, true, address(router));
        emit RevenueRouter.MerchantUpdated(merchantId, payout, "Acme 2");
        vm.prank(owner);
        router.setName(merchantId, "Acme 2");
        RevenueRouter.Merchant memory m = router.getMerchant(merchantId);
        assertEq(m.name, "Acme 2");
        assertEq(m.slug, "acme", "slug immutable");
    }

    function test_SetName_InvalidReverts() public {
        vm.startPrank(owner);
        vm.expectRevert(RevenueRouter.InvalidName.selector);
        router.setName(merchantId, "");
        string memory tooLong = _rep("n", 65);
        vm.expectRevert(RevenueRouter.InvalidName.selector);
        router.setName(merchantId, tooLong);
        vm.stopPrank();
    }

    function test_SelfPayment_OwnerReverts() public {
        uint256 v = _value(monthlyId);
        vm.prank(owner);
        vm.expectRevert(RevenueRouter.SelfPayment.selector);
        router.pay{value: v}(monthlyId, REF);
    }

    function test_SelfPayment_PayoutReverts() public {
        vm.deal(payout, 1e24);
        uint256 v = _value(oneTimeId);
        vm.prank(payout);
        vm.expectRevert(RevenueRouter.SelfPayment.selector);
        router.pay{value: v}(oneTimeId, REF);
    }

    function test_SelfPayment_FollowsCurrentPayout() public {
        vm.deal(payout, 1e24);
        vm.prank(owner);
        router.setPayout(merchantId, bob);
        // old payout may now pay, new payout (bob) may not
        _pay(payout, oneTimeId);
        uint256 v = _value(oneTimeId);
        vm.prank(bob);
        vm.expectRevert(RevenueRouter.SelfPayment.selector);
        router.pay{value: v}(oneTimeId, REF);
    }

    function test_SelfPayment_OwnerIsAlsoPayout() public {
        vm.prank(owner);
        router.setPayout(merchantId, owner);
        uint256 v = _value(monthlyId);
        vm.prank(owner);
        vm.expectRevert(RevenueRouter.SelfPayment.selector);
        router.pay{value: v}(monthlyId, REF);
    }
}
