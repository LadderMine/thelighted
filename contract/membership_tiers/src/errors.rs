use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum MembershipError {
    /// Contract already initialized
    AlreadyInitialized = 1,
    /// Unauthorized access
    Unauthorized = 2,
    /// Invalid tier thresholds (must be bronze < silver < gold)
    InvalidThresholds = 3,
    /// User not found
    UserNotFound = 4,
    /// Invalid tier
    InvalidTier = 5,
}
