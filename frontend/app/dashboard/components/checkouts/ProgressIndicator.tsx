"use client";

const steps = ["Cart", "Payment", "Confirmation"];

export default function ProgressIndicator({ step = 0 }: { step: number }) {
  return (
    <div className="flex justify-between mb-6 text-sm">
      {steps.map((label, index) => (
        <span
          key={label}
          className={
            index <= step
              ? "font-semibold text-black"
              : "text-gray-400"
          }
        >
          {label}
        </span>
      ))}
    </div>
  );
}
