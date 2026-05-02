// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockKleros
/// @notice Mock Kleros arbitrator for testing KlerosAdapterV1
contract MockKleros {
    uint256 public constant ARBITRATION_COST = 0.01 ether;

    struct MockDispute {
        uint256 choices;
        bool ruled;
        uint256 ruling;
        address arbitrable;
    }

    mapping(uint256 => MockDispute) public disputes;
    uint256 public disputeCount;

    event DisputeCreated(uint256 indexed disputeId, address indexed arbitrable, uint256 choices);
    event Ruling(address indexed arbitrable, uint256 indexed disputeId, uint256 ruling);

    function arbitrationCost(bytes calldata) external pure returns (uint256) {
        return ARBITRATION_COST;
    }

    function createDispute(uint256 choices, bytes calldata) external payable returns (uint256 disputeId) {
        require(msg.value >= ARBITRATION_COST, "MockKleros: insufficient fee");
        disputeId = disputeCount++;
        disputes[disputeId] = MockDispute({
            choices: choices,
            ruled: false,
            ruling: 0,
            arbitrable: msg.sender
        });
        emit DisputeCreated(disputeId, msg.sender, choices);
    }

    /// @notice Simulate Kleros ruling delivery (test helper)
    function giveRuling(uint256 disputeId, uint256 ruling) external {
        MockDispute storage d = disputes[disputeId];
        require(!d.ruled, "MockKleros: already ruled");
        require(ruling <= d.choices, "MockKleros: invalid ruling");
        d.ruled = true;
        d.ruling = ruling;

        // Call rule() on the arbitrable (KlerosAdapterV1)
        (bool ok,) = d.arbitrable.call(
            abi.encodeWithSignature("rule(uint256,uint256)", disputeId, ruling)
        );
        require(ok, "MockKleros: rule callback failed");

        emit Ruling(d.arbitrable, disputeId, ruling);
    }

    function currentRuling(uint256 disputeId) external view returns (uint256) {
        return disputes[disputeId].ruling;
    }
}
