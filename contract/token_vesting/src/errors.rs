use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum VestingError {
    /// Contract already initialized
    AlreadyInitialized = 1,
    /// Unauthorized access
    Unauthorized = 2,
    /// Invalid amount (must be positive)
    InvalidAmount = 3,
    /// Invalid duration (must be positive)
    InvalidDuration = 4,
    /// Invalid cliff (cannot be longer than duration)
    InvalidCliff = 5,
    /// Invalid start time (cannot be in the past)
    InvalidStartTime = 6,
    /// Vesting schedule not found
    ScheduleNotFound = 7,
    /// Vesting schedule already cancelled
    AlreadyCancelled = 8,
    /// No tokens to claim
    NoTokensToClaim = 9,
}