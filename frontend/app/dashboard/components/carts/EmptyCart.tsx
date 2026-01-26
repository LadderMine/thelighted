"use client";

export default function EmptyCart() {
  return (
    <div className="border rounded-xl p-8 text-center">
      <p className="text-gray-500 mb-4">Your cart is empty</p>
      <a
        href="/"
        className="inline-block px-4 py-2 bg-black text-white rounded"
      >
        Continue Shopping
      </a>
    </div>
  );
}
