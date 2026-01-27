use soroban_sdk::{contracttype, Address, Env, Vec};
use crate::types::VestingSchedule;
use crate::errors::VestingError;

#[contracttype]
pub enum DataKey {
    Admin,
    TokenAddress,
    VestingSchedule(u32),
    UserSchedules(Address),
    NextScheduleId,
}

const DAY_IN_LEDGERS: u32 = 17280; // Approximate ledgers per day
const INSTANCE_LIFETIME_THRESHOLD: u32 = DAY_IN_LEDGERS * 30; // 30 days
const INSTANCE_BUMP_AMOUNT: u32 = DAY_IN_LEDGERS * 30; // 30 days

// Admin functions
pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

pub fn get_admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

pub fn has_admin(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Admin)
}

pub fn is_admin(env: &Env, address: &Address) -> bool {
    if let Some(admin) = env.storage().instance().get::<DataKey, Address>(&DataKey::Admin) {
        admin == *address
    } else {
        false
    }
}

// Token address
pub fn set_token_address(env: &Env, token_address: &Address) {
    env.storage().instance().set(&DataKey::TokenAddress, token_address);
}

pub fn get_token_address(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::TokenAddress).unwrap()
}

// Vesting schedule management
pub fn add_vesting_schedule(env: &Env, schedule: &VestingSchedule) -> u32 {
    let schedule_id = get_next_schedule_id(env);
    
    // Store the schedule
    let key = DataKey::VestingSchedule(schedule_id);
    env.storage().persistent().set(&key, schedule);
    env.storage()
        .persistent()
        .extend_ttl(&key, INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    
    // Add to user's schedule list
    add_user_schedule(env, &schedule.recipient, schedule_id);
    
    // Increment next schedule ID
    set_next_schedule_id(env, schedule_id + 1);
    
    schedule_id
}

pub fn get_vesting_schedule(env: &Env, schedule_id: &u32) -> Result<VestingSchedule, VestingError> {
    let key = DataKey::VestingSchedule(*schedule_id);
    
    if let Some(schedule) = env.storage().persistent().get::<DataKey, VestingSchedule>(&key) {
        env.storage()
            .persistent()
            .extend_ttl(&key, INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        Ok(schedule)
    } else {
        Err(VestingError::ScheduleNotFound)
    }
}

pub fn set_vesting_schedule(env: &Env, schedule_id: &u32, schedule: &VestingSchedule) {
    let key = DataKey::VestingSchedule(*schedule_id);
    env.storage().persistent().set(&key, schedule);
    env.storage()
        .persistent()
        .extend_ttl(&key, INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

// User schedule tracking
pub fn add_user_schedule(env: &Env, user: &Address, schedule_id: u32) {
    let key = DataKey::UserSchedules(user.clone());
    let mut schedules = get_user_vesting_schedules(env, user);
    
    schedules.push_back(schedule_id);
    
    env.storage().persistent().set(&key, &schedules);
    env.storage()
        .persistent()
        .extend_ttl(&key, INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

pub fn get_user_vesting_schedules(env: &Env, user: &Address) -> Vec<u32> {
    let key = DataKey::UserSchedules(user.clone());
    
    if let Some(schedules) = env.storage().persistent().get::<DataKey, Vec<u32>>(&key) {
        env.storage()
            .persistent()
            .extend_ttl(&key, INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        schedules
    } else {
        Vec::new(env)
    }
}

// Schedule ID management
fn get_next_schedule_id(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::NextScheduleId)
        .unwrap_or(1u32)
}

fn set_next_schedule_id(env: &Env, id: u32) {
    env.storage().instance().set(&DataKey::NextScheduleId, &id);
}