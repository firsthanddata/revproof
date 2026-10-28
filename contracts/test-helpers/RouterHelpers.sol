// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {RevenueRouter} from "../RevenueRouter.sol";

/// @dev Receiver that always rejects native value.
contract RejectingReceiver {
    receive() external payable {
        revert("no value accepted");
    }
}

/// @dev Usable as payout address and/or payer. When armed, on receiving native value it
/// tries (once) to re-enter router.pay and router.refund and records the outcome.
contract ReentrantReceiver {
    RevenueRouter public immutable router;
    uint256 public targetProduct;
    uint256 public targetPayment;
    bool public armed;

    uint256 public receiveCount;
    bool public payOk;
    bool public refundOk;
    bytes public payRevertData;
    bytes public refundRevertData;

    constructor(RevenueRouter r) {
        router = r;
    }

    function arm(uint256 productId, uint256 paymentId) external {
        targetProduct = productId;
        targetPayment = paymentId;
        armed = true;
    }

    function payThrough(uint256 productId, bytes32 ref) external payable returns (uint256) {
        return router.pay{value: msg.value}(productId, ref);
    }

    receive() external payable {
        ++receiveCount;
        if (!armed) return;
        armed = false;
        (bool ok, bytes memory data) = address(router).call{value: msg.value}(
            abi.encodeCall(RevenueRouter.pay, (targetProduct, bytes32(0)))
        );
        payOk = ok;
        payRevertData = data;
        (ok, data) = address(router).call{value: msg.value}(abi.encodeCall(RevenueRouter.refund, (targetPayment)));
        refundOk = ok;
        refundRevertData = data;
    }
}
