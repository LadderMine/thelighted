use soroban_sdk::{Env, Address, symbol_short};

pub fn emit_vesting_created(
    env: &Env,
    schedule_id: u32,
    recipient: &Address,
    total_amount: i128,
    start_time: u64,
    duration: u64,
    cliff: u64,
) {
    env.events().publish(
        (symbol_short!("vest_cr"),),
        (
            schedule_id,
            recipient.clone(),
            total_amount,
            start_time,
            duration,
            cliff,
        ),
    );
}

pub fn emit_tokens_claimed(
    env: &Env,
    schedule_id: u32,
    recipient: &Address,
    amount: i128,
) {
    env.events().publish(
        (symbol_short!("claim"),),
        (schedule_id, recipient.clone(), amount),
    );
}

pub fn emit_vesting_cancelled(
    env: &Env,
    schedule_id: u32,
    recipient: &Address,
    unvested_amount: i128,
) {
    env.events().publish(
        (symbol_short!("vest_can"),),
        (schedule_id, recipient.clone(), unvested_amount),
    );
}