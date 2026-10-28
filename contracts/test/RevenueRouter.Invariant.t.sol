// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {RevenueRouter} from "../RevenueRouter.sol";

/// @dev Drives bounded random actions. The handler itself is the merchant owner.
contract RouterHandler is Test {
    RevenueRouter public immutable router;
    uint256 public merchantId;
    uint256[] public productIds;
    uint256[] public paymentIds;
    address[] public actors;
    address[] public payouts;
    uint256 public ghostPaid;
    uint256 public ghostRefunded;

    constructor(RevenueRouter r) {
        router = r;
        for (uint256 i; i < 3; ++i) {
            actors.push(makeAddr(string.concat("actor", vm.toString(i))));
            payouts.push(makeAddr(string.concat("payout", vm.toString(i))));
            vm.deal(actors[i], 1e24);
        }
        vm.deal(address(this), 1e27);
        merchantId = router.registerMerchant("Handler", "handler", payouts[0]);
        productIds.push(router.createProduct(merchantId, "M1", 10e6, RevenueRouter.Billing.Monthly));
        productIds.push(router.createProduct(merchantId, "M2", 25e6, RevenueRouter.Billing.Monthly));
        productIds.push(router.createProduct(merchantId, "O1", 5e6, RevenueRouter.Billing.OneTime));
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function productCount() external view returns (uint256) {
        return productIds.length;
    }

    function pay(uint256 actorSeed, uint256 productSeed) external {
        address a = actors[actorSeed % actors.length];
        uint256 pid = productIds[productSeed % productIds.length];
        uint256 v = uint256(router.getProduct(pid).price) * 1e12;
        vm.prank(a);
        try router.pay{value: v}(pid, bytes32(actorSeed)) returns (uint256 id) {
            paymentIds.push(id);
            ghostPaid += v;
        } catch {}
    }

    function payWrongValue(uint256 actorSeed, uint256 productSeed, uint256 value) external {
        address a = actors[actorSeed % actors.length];
        uint256 pid = productIds[productSeed % productIds.length];
        value = bound(value, 0, 1e20);
        vm.prank(a);
        try router.pay{value: value}(pid, bytes32(0)) returns (uint256 id) {
            // only possible if value happened to equal the exact price
            paymentIds.push(id);
            ghostPaid += value;
        } catch {}
    }

    function refund(uint256 seed) external {
        if (paymentIds.length == 0) return;
        uint256 id = paymentIds[seed % paymentIds.length];
        uint256 v = uint256(router.getPayment(id).amount) * 1e12;
        try router.refund{value: v}(id) {
            ghostRefunded += v;
        } catch {}
    }

    function setPayout(uint256 seed) external {
        router.setPayout(merchantId, payouts[seed % payouts.length]);
    }

    function togglePause(uint256 productSeed, bool active) external {
        router.setProductActive(productIds[productSeed % productIds.length], active);
    }

    function repriceProduct(uint256 productSeed, uint128 price) external {
        price = uint128(bound(price, 1, 100e6));
        router.updateProduct(productIds[productSeed % productIds.length], "Re", price);
    }

    function warp(uint256 dt) external {
        skip(bound(dt, 0, 45 days));
    }

    function payoutBalanceSum() external view returns (uint256 s) {
        for (uint256 i; i < payouts.length; ++i) s += payouts[i].balance;
    }
}

contract RevenueRouterInvariantTest is Test {
    RevenueRouter internal router;
    RouterHandler internal handler;

    function setUp() public {
        vm.warp(1_700_000_000);
        router = new RevenueRouter();
        handler = new RouterHandler(router);
        targetContract(address(handler));
    }

    /// PROPERTY: the router never holds native funds.
    function invariant_RouterBalanceAlwaysZero() public view {
        assertEq(address(router).balance, 0);
    }

    /// PROPERTY: every unit paid in is sitting with some payout address (refunds come from
    /// the merchant's own wallet, never from payout balances).
    function invariant_PaidFundsEndUpWithPayouts() public view {
        assertEq(handler.payoutBalanceSum(), handler.ghostPaid());
    }

    /// PROPERTY: mrr() equals the sum of amounts of active monthly subscriptions.
    function invariant_MrrMatchesActiveSubscriptions() public view {
        uint256 expected;
        uint256 mid = handler.merchantId();
        for (uint256 p; p < handler.productCount(); ++p) {
            uint256 pid = handler.productIds(p);
            if (router.getProduct(pid).billing != RevenueRouter.Billing.Monthly) continue;
            for (uint256 a; a < handler.actorCount(); ++a) {
                address actor = handler.actors(a);
                if (router.isSubscriptionActive(pid, actor)) {
                    (, uint128 amount) = router.subscriptionOf(pid, actor);
                    expected += amount;
                }
            }
        }
        assertEq(router.mrr(mid), expected);
    }

    /// PROPERTY: one-time products never produce a subscription.
    function invariant_OneTimeProductsHaveNoSubscriptions() public view {
        uint256 oneTime = handler.productIds(2);
        for (uint256 a; a < handler.actorCount(); ++a) {
            (uint64 until, uint128 amount) = router.subscriptionOf(oneTime, handler.actors(a));
            assertEq(until, 0);
            assertEq(amount, 0);
        }
    }
}
