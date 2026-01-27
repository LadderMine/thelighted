#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Env, Vec};

mod errors;
mod events;
mod storage;
mod types;

#[cfg(test)]
mod test;

use errors::VestingError;
use types::{VestingSchedule, VestingInfo};

#[contract]
pub struct TokenVestingContract;

#[contractimpl]
impl TokenVestingContract {
    /// Initialize the contract with token address and admin
    pub fn initialize(
        env: Env,
        admin: Address,
        token_address: Address,
    ) -> Result<(), VestingError> {
        admin.require_auth();
        
        if storage::has_admin(&env) {
            return Err(VestingError::AlreadyInitialized);
        }
        
        storage::set_admin(&env, &admin);
        storage::set_token_address(&env, &token_address);
        
        Ok(())
    }

    /// Create a vesting schedule for a recipient
    pub fn create_vesting(
        env: Env,
        admin: Address,
        recipient: Address,
        total_amount: i128,
        start_time: u64,
        duration: u64,
        cliff: u64,
    ) -> Result<u32, VestingError> {
        admin.require_auth();
        
        if !storage::is_admin(&env, &admin) {
            return Err(VestingError::Unauthorized);
        }
        
        if total_amount <= 0 {
            return Err(VestingError::InvalidAmount);
        }
        
        if duration == 0 {
            return Err(VestingError::InvalidDuration);
        }
        
        if cliff > duration {
            return Err(VestingError::InvalidCliff);
        }
        
        let current_time = env.ledger().timestamp();
        if start_time < current_time {
            return Err(VestingError::InvalidStartTime);
        }
        
        let schedule = VestingSchedule {
            recipient: recipient.clone(),
            total_amount,
            start_time,
            duration,
            cliff,
            claimed_amount: 0,
            cancelled: false,
        };
        
        let schedule_id = storage::add_vesting_schedule(&env, &schedule);
        
        events::emit_vesting_created(
            &env,
            schedule_id,
            &recipient,
            total_amount,
            start_time,
            duration,
            cliff,
        );
        
        Ok(schedule_id)
    }

    /// Claim vested tokens for the caller
    pub fn claim_vested(env: Env, recipient: Address) -> Result<i128, VestingError> {
        recipient.require_auth();
        
        let schedules = storage::get_user_vesting_schedules(&env, &recipient);
        let mut total_claimable = 0i128;
        
        for schedule_id in schedules.iter() {
            let mut schedule = storage::get_vesting_schedule(&env, &schedule_id)?;
            
            if schedule.cancelled {
                continue;
            }
            
            let claimable = Self::get_claimable_amount_for_schedule(&env, &schedule);
            
            if claimable > 0 {
                schedule.claimed_amount += claimable;
                storage::set_vesting_schedule(&env, &schedule_id, &schedule);
                total_claimable += claimable;
                
                events::emit_tokens_claimed(&env, schedule_id, &recipient, claimable);
            }
        }
        
        if total_claimable > 0 {
            // In a real implementation, transfer tokens from contract to recipient
            // For testing, we'll just emit the event and return the amount
            // let token_address = storage::get_token_address(&env);
            // let contract_address = env.current_contract_address();
            // 
            // let _result: () = env.invoke_contract(
            //     &token_address,
            //     &soroban_sdk::symbol_short!("transfer"),
            //     (contract_address, recipient.clone(), total_claimable).into_val(&env),
            // );
        }
        
        Ok(total_claimable)
    }

    /// Get total vested amount for a user across all schedules
    pub fn get_vested_amount(env: Env, user: Address) -> i128 {
        let schedules = storage::get_user_vesting_schedules(&env, &user);
        let mut total_vested = 0i128;
        
        for schedule_id in schedules.iter() {
            if let Ok(schedule) = storage::get_vesting_schedule(&env, &schedule_id) {
                if !schedule.cancelled {
                    total_vested += Self::calculate_vested_amount(&env, &schedule);
                }
            }
        }
        
        total_vested
    }

    /// Get claimable amount for a user (vested but not yet claimed)
    pub fn get_claimable_amount(env: Env, user: Address) -> i128 {
        let schedules = storage::get_user_vesting_schedules(&env, &user);
        let mut total_claimable = 0i128;
        
        for schedule_id in schedules.iter() {
            if let Ok(schedule) = storage::get_vesting_schedule(&env, &schedule_id) {
                if !schedule.cancelled {
                    total_claimable += Self::get_claimable_amount_for_schedule(&env, &schedule);
                }
            }
        }
        
        total_claimable
    }

    /// Cancel a vesting schedule and return unvested tokens
    pub fn cancel_vesting(
        env: Env,
        admin: Address,
        schedule_id: u32,
    ) -> Result<i128, VestingError> {
        admin.require_auth();
        
        if !storage::is_admin(&env, &admin) {
            return Err(VestingError::Unauthorized);
        }
        
        let mut schedule = storage::get_vesting_schedule(&env, &schedule_id)?;
        
        if schedule.cancelled {
            return Err(VestingError::AlreadyCancelled);
        }
        
        let vested_amount = Self::calculate_vested_amount(&env, &schedule);
        let unvested_amount = schedule.total_amount - vested_amount;
        
        schedule.cancelled = true;
        storage::set_vesting_schedule(&env, &schedule_id, &schedule);
        
        events::emit_vesting_cancelled(&env, schedule_id, &schedule.recipient, unvested_amount);
        
        Ok(unvested_amount)
    }

    /// Get vesting schedule details
    pub fn get_vesting_schedule(env: Env, schedule_id: u32) -> Result<VestingSchedule, VestingError> {
        storage::get_vesting_schedule(&env, &schedule_id)
    }

    /// Get all vesting schedules for a user
    pub fn get_user_vesting_info(env: Env, user: Address) -> Vec<VestingInfo> {
        let schedules = storage::get_user_vesting_schedules(&env, &user);
        let mut vesting_info = Vec::new(&env);
        
        for schedule_id in schedules.iter() {
            if let Ok(schedule) = storage::get_vesting_schedule(&env, &schedule_id) {
                let vested_amount = Self::calculate_vested_amount(&env, &schedule);
                let claimable_amount = Self::get_claimable_amount_for_schedule(&env, &schedule);
                
                let info = VestingInfo {
                    schedule_id,
                    schedule: schedule.clone(),
                    vested_amount,
                    claimable_amount,
                };
                
                vesting_info.push_back(info);
            }
        }
        
        vesting_info
    }

    // Internal helper functions
    fn calculate_vested_amount(env: &Env, schedule: &VestingSchedule) -> i128 {
        let current_time = env.ledger().timestamp();
        
        if current_time < schedule.start_time + schedule.cliff {
            return 0; // Cliff period not passed
        }
        
        if current_time >= schedule.start_time + schedule.duration {
            return schedule.total_amount; // Fully vested
        }
        
        // Linear vesting calculation
        let elapsed_time = current_time - schedule.start_time;
        let vested_amount = (schedule.total_amount * elapsed_time as i128) / schedule.duration as i128;
        
        vested_amount
    }
    
    fn get_claimable_amount_for_schedule(env: &Env, schedule: &VestingSchedule) -> i128 {
        let vested_amount = Self::calculate_vested_amount(env, schedule);
        let claimable = vested_amount - schedule.claimed_amount;
        
        if claimable > 0 { claimable } else { 0 }
    }
}