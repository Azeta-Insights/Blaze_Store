import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  CheckCircle2,
  Lock,
  ArrowRight,
  ShieldCheck,
  ShoppingBag,
  Banknote,
  Loader2,
  Zap,
} from 'lucide-react';
import { CartItem, User } from '../types';
import { api } from '../services/api';
import { formatNaira } from '../lib/currency';

declare global {
  interface Window {
    PaystackPop?: {
      setup: (options: {
        key: string;
        email: string;
        amount: number;
        currency?: string;
        ref?: string;
        channels?: string[];
        metadata?: any;
        callback?: (response: { reference: string; status?: string }) => void;
        onClose?: () => void;
      }) => {
        openIframe: () => void;
      };
      newTransaction?: (options: any) => void;
    };
  }
}

const FALLBACK_TEST_KEY = 'pk_test_a0d8a57ba8d98d28cfadcae69784f18548981442';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  currentUser?: User | null;
  onClearCart: () => void;
  onPlaceOrder?: (orderData: any) => Promise<any>;
  isDarkMode: boolean;
  onShowToast?: (msg: string) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  cart,
  currentUser,
  onClearCart,
  onPlaceOrder,
  isDarkMode,
  onShowToast,
}) => {
  const [step, setStep] = useState<'form' | 'processing' | 'success'>('form');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderId, setOrderId] = useState<string>(() => `NG-${Math.floor(100000 + Math.random() * 900000)}`);
  const [paymentStatusText, setPaymentStatusText] = useState<string>('');
  const [paystackPublicKey, setPaystackPublicKey] = useState<string>(FALLBACK_TEST_KEY);

  // Form input state tailored for Nigerian customers
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: 'Lagos',
    state: 'Lagos State',
    country: 'Nigeria',
    paymentMethod: 'paystack', // 'paystack' | 'card' | 'cod'
    cardNumber: '',
    cardExpiry: '',
    cardCvc: '',
  });

  // Ensure Paystack inline script is loaded into the browser
  const ensurePaystackSDK = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.PaystackPop) return resolve(true);
      const existing = document.getElementById('paystack-inline-js');
      if (existing) {
        existing.addEventListener('load', () => resolve(Boolean(window.PaystackPop)));
        setTimeout(() => resolve(Boolean(window.PaystackPop)), 1500);
        return;
      }
      const script = document.createElement('script');
      script.id = 'paystack-inline-js';
      script.src = 'https://js.paystack.co/v1/inline.js';
      script.async = true;
      script.onload = () => resolve(Boolean(window.PaystackPop));
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  useEffect(() => {
    ensurePaystackSDK();
  }, []);

  useEffect(() => {
    if (currentUser) {
      setFormData((prev) => ({
        ...prev,
        name: currentUser.name || prev.name,
        email: currentUser.email || prev.email,
        phone: currentUser.phone || prev.phone,
      }));
    }
  }, [currentUser, isOpen]);

  // Load Paystack public key
  const refreshPaystackConfig = () => {
    api.getPaystackConfig().then((cfg) => {
      if (cfg?.publicKey) {
        setPaystackPublicKey(cfg.publicKey);
      }
    });
  };

  useEffect(() => {
    try {
      const storedSecret = localStorage.getItem('blazestore_paystack_secret_key');
      const storedPublic = localStorage.getItem('blazestore_paystack_public_key');
      if (storedSecret || storedPublic) {
        api.updatePaystackConfig({
          secretKey: storedSecret || undefined,
          publicKey: storedPublic || undefined,
        }).then(() => refreshPaystackConfig());
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (isOpen) {
      refreshPaystackConfig();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Pricing calculations in Naira (₦)
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = subtotal >= 80000 ? subtotal * 0.15 : subtotal >= 40000 ? subtotal * 0.1 : 0;
  const shipping = subtotal >= 50000 ? 0 : 2500; // Free delivery above ₦50k, else ₦2,500 standard courier
  const vatTax = subtotal * 0.075; // Standard 7.5% Nigerian VAT
  const total = Math.max(0, subtotal - discount + shipping + vatTax);

  // Format Card input
  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 19);
    const formatted = val.replace(/(\d{4})(?=\d)/g, '$1 ');
    setFormData({ ...formData, cardNumber: formatted });
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (val.length >= 3) {
      val = `${val.slice(0, 2)}/${val.slice(2, 4)}`;
    }
    setFormData({ ...formData, cardExpiry: val });
  };

  const finalizeOrder = async (
    ref: string,
    paymentMethodName: string,
    paymentStatus: 'paid' | 'pending' = 'paid',
    paystackData?: any
  ) => {
    const generatedId = `NG-${Date.now().toString().slice(-6)}`;
    let currentOrderId = generatedId;

    if (onPlaceOrder) {
      const orderResult = await onPlaceOrder({
        customer: {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          country: formData.country,
        },
        currency: 'NGN',
        currencySymbol: '₦',
        items: cart,
        subtotal,
        discount,
        shipping,
        tax: vatTax,
        total,
        paymentMethod: paymentMethodName,
        paymentStatus,
        paymentReference: ref,
        paystackData,
        userId: currentUser?.id || 'guest',
      });
      if (orderResult?.orderId) {
        currentOrderId = orderResult.orderId;
      }
    }

    setOrderId(currentOrderId);
    setStep('success');
    onClearCart();
    try {
      localStorage.removeItem('blazestore_pending_order');
    } catch {}

    if (onShowToast) {
      if (paymentStatus === 'paid') {
        onShowToast(`🎉 Order #${currentOrderId} confirmed!`);
      } else {
        onShowToast(`📋 Order #${currentOrderId} placed! Pay on delivery: ${formatNaira(total)}`);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const reference = `blz_paystack_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const effectivePublicKey = paystackPublicKey || FALLBACK_TEST_KEY;

    // Handle Pay on Delivery (Doorstep cash/POS)
    if (formData.paymentMethod === 'cod') {
      setStep('processing');
      setPaymentStatusText('Confirming your delivery details...');
      try {
        await new Promise((r) => setTimeout(r, 600));
        await finalizeOrder(reference, 'Pay on Delivery (COD)', 'pending');
      } catch (err: any) {
        console.error('COD order placement error:', err);
        await finalizeOrder(reference, 'Pay on Delivery (COD)', 'pending');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Handle Electronic Paystack Payment Methods
    try {
      setPaymentStatusText('Connecting to secure payment gateway...');

      let selectedChannels = ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer', 'eft'];
      if (formData.paymentMethod === 'card') {
        selectedChannels = ['card'];
      }

      // Store pending order details in localStorage for redirect resilience
      try {
        localStorage.setItem(
          'blazestore_pending_order',
          JSON.stringify({
            reference,
            customer: formData,
            total,
            items: cart,
            date: new Date().toISOString(),
          })
        );
      } catch {}

      // 1. Initialize transaction with Paystack Backend
      const initRes = await api.initializePaystack({
        email: formData.email || 'customer@blazestore.ng',
        amount: total,
        reference,
        channels: selectedChannels,
        callbackUrl: `${window.location.origin}/?paystack_ref=${reference}`,
        metadata: {
          customerName: formData.name,
          customerPhone: formData.phone,
          deliveryAddress: `${formData.address}, ${formData.city}, ${formData.state}`,
          paymentOption: formData.paymentMethod,
        },
      });

      // 2. Launch Official Paystack Inline Popup or Hosted Page
      const sdkReady = await ensurePaystackSDK();

      if (window.PaystackPop && sdkReady) {
        setPaymentStatusText('Opening secure payment window...');
        const handler = window.PaystackPop.setup({
          key: effectivePublicKey,
          email: formData.email || 'customer@blazestore.ng',
          amount: Math.round(total * 100), // amount in kobo
          currency: 'NGN',
          ref: initRes.reference || reference,
          channels: selectedChannels,
          metadata: {
            custom_fields: [
              { display_name: 'Customer Name', variable_name: 'customer_name', value: formData.name },
              { display_name: 'Phone', variable_name: 'customer_phone', value: formData.phone },
              { display_name: 'Delivery Address', variable_name: 'delivery_address', value: `${formData.address}, ${formData.city}, ${formData.state}` },
            ],
          },
          callback: async (response: { reference: string; status?: string }) => {
            setStep('processing');
            setPaymentStatusText('Verifying transaction...');
            try {
              const verifyRes = await api.verifyPaystack(response.reference);
              if (verifyRes && verifyRes.paid) {
                await finalizeOrder(response.reference, 'Paystack', 'paid', verifyRes);
              } else {
                setStep('form');
                const errMsg = verifyRes?.gatewayResponse || verifyRes?.error || 'Transaction was not completed.';
                if (onShowToast) onShowToast(`Payment unsuccessful: ${errMsg}`);
              }
            } catch (err: any) {
              console.warn('Verify error:', err);
              setStep('form');
              if (onShowToast) onShowToast('Payment verification failed. Please try again.');
            } finally {
              setIsSubmitting(false);
            }
          },
          onClose: () => {
            setIsSubmitting(false);
            setStep('form');
          },
        });

        handler.openIframe();
        return;
      } else if (initRes.authorizationUrl) {
        window.location.href = initRes.authorizationUrl;
        return;
      } else {
        throw new Error('Unable to connect to payment provider.');
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      if (onShowToast) onShowToast('Unable to complete payment. Please try again or choose another method.');
      setIsSubmitting(false);
      setStep('form');
      return;
    }
  };

  const handleFinish = () => {
    onClose();
    setStep('form');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div
        className={`relative z-10 w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 shadow-2xl transition-all border scrollbar-thin ${
          isDarkMode
            ? 'bg-[#18181B] text-[#EDEDF2] border-[#27272A]'
            : 'bg-white text-[#1F1F23] border-[#E2E8F0]'
        }`}
      >
        {step === 'form' ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#CBD5E1] dark:border-[#27272A] pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#00C3F7]/15 text-[#00A4D6] dark:text-[#00C3F7]">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg text-[#0F172A] dark:text-[#F8FAFC]">Secure Checkout</h3>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#00C3F7]/10 text-[#00A4D6] dark:text-[#00C3F7]">
                      NGN • ₦
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[#475569] dark:text-[#94A3B8]">
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <ShieldCheck className="h-3.5 w-3.5" /> 256-bit Encrypted
                    </span>
                    <span>•</span>
                    <span>Fast Delivery Across Nigeria</span>
                  </div>
                </div>
              </div>
              <button
                id="checkout-close-btn"
                onClick={onClose}
                className="p-2 rounded-xl text-[#64748B] dark:text-[#94A3B8] hover:bg-[#F1F5F9] dark:hover:bg-[#27272A] transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {/* Customer Contact & Delivery Info */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#475569] dark:text-[#94A3B8]">
                    1. Delivery Information
                  </h4>
                  {currentUser && (
                    <span className="text-[11px] font-medium text-[#7C6FE0] bg-[#7C6FE0]/10 px-2.5 py-0.5 rounded-full">
                      {currentUser.name.split(' ')[0]}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] font-semibold text-[#1E293B] dark:text-[#E2E8F0] block mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Azeta Blessing"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#27272A] px-3.5 py-2.5 text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#00C3F7]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#1E293B] dark:text-[#E2E8F0] block mb-1">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. name@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#27272A] px-3.5 py-2.5 text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#00C3F7]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-[#1E293B] dark:text-[#E2E8F0] block mb-1">
                    Street Address *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 14 Admiralty Way, Lekki Phase 1"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#27272A] px-3.5 py-2.5 text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#00C3F7]"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div className="col-span-1">
                    <label className="text-[11px] font-semibold text-[#1E293B] dark:text-[#E2E8F0] block mb-1">City *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ikeja"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#27272A] px-3 py-2.5 text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#00C3F7]"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="text-[11px] font-semibold text-[#1E293B] dark:text-[#E2E8F0] block mb-1">State *</label>
                    <select
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#27272A] px-2 py-2.5 text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#00C3F7]"
                    >
                      <option value="Lagos State">Lagos</option>
                      <option value="Abuja (FCT)">Abuja (FCT)</option>
                      <option value="Rivers State">Rivers</option>
                      <option value="Oyo State">Oyo</option>
                      <option value="Edo State">Edo</option>
                      <option value="Delta State">Delta</option>
                      <option value="Kano State">Kano</option>
                      <option value="Enugu State">Enugu</option>
                      <option value="Anambra State">Anambra</option>
                      <option value="Ogun State">Ogun</option>
                      <option value="Kaduna State">Kaduna</option>
                      <option value="Other Nigerian State">Other State</option>
                    </select>
                  </div>
                  <div className="col-span-1">
                    <label className="text-[11px] font-semibold text-[#1E293B] dark:text-[#E2E8F0] block mb-1">Phone Number *</label>
                    <input
                      type="tel"
                      required
                      placeholder="+234 803 123 4567"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#27272A] px-3 py-2.5 text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#00C3F7]"
                    />
                  </div>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#475569] dark:text-[#94A3B8]">
                    2. Payment Option
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'paystack', label: 'Pay with Paystack', sub: 'Cards, Transfer, USSD, Apple Pay', icon: Zap, badge: 'Popular' },
                    { id: 'card', label: 'Debit / Credit Card', sub: 'Mastercard, VISA, Verve', icon: CreditCard },
                    { id: 'cod', label: 'Pay on Delivery', sub: 'Cash / POS on arrival', icon: Banknote },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, paymentMethod: p.id })}
                      className={`relative flex flex-col items-center justify-center rounded-2xl p-3 border text-xs font-semibold transition text-center ${
                        formData.paymentMethod === p.id
                          ? 'border-[#00C3F7] bg-[#00C3F7]/10 text-[#00A4D6] dark:text-[#00C3F7] shadow-sm'
                          : 'border-[#CBD5E1] dark:border-[#27272A] text-[#475569] dark:text-[#94A3B8] hover:bg-[#F8FAFC] dark:hover:bg-[#27272A]'
                      }`}
                    >
                      {p.badge && (
                        <span className="absolute top-1.5 right-1.5 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-[#00C3F7] text-slate-900">
                          {p.badge}
                        </span>
                      )}
                      <p.icon className="h-4 w-4 mb-1 mt-0.5" />
                      <span className="text-[11px] leading-tight font-bold">{p.label}</span>
                      <span className="text-[9px] text-slate-500 font-normal mt-0.5">{p.sub}</span>
                    </button>
                  ))}
                </div>

                {/* Inline Card Details if user selects Card */}
                {formData.paymentMethod === 'card' && (
                  <div className="rounded-2xl border border-[#CBD5E1] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#27272A]/70 p-3.5 space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#1E293B] dark:text-[#E2E8F0]">Card Details</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">VERVE</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">VISA</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">MASTERCARD</span>
                      </div>
                    </div>

                    <div>
                      <input
                        type="text"
                        required={formData.paymentMethod === 'card'}
                        placeholder="Card Number"
                        value={formData.cardNumber}
                        onChange={handleCardNumberChange}
                        className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#475569] bg-white dark:bg-[#1E1E24] px-3.5 py-2 text-xs font-mono font-medium text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#00C3F7]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <input
                          type="text"
                          required={formData.paymentMethod === 'card'}
                          placeholder="MM / YY"
                          value={formData.cardExpiry}
                          onChange={handleExpiryChange}
                          className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#475569] bg-white dark:bg-[#1E1E24] px-3.5 py-2 text-xs font-mono font-medium text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#00C3F7]"
                        />
                      </div>
                      <div>
                        <input
                          type="password"
                          maxLength={4}
                          required={formData.paymentMethod === 'card'}
                          placeholder="CVV"
                          value={formData.cardCvc}
                          onChange={(e) => setFormData({ ...formData, cardCvc: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                          className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#475569] bg-white dark:bg-[#1E1E24] px-3.5 py-2 text-xs font-mono font-medium text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#00C3F7]"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Pay on Delivery info */}
                {formData.paymentMethod === 'cod' && (
                  <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-3.5 text-xs space-y-1.5">
                    <div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-300">
                      <Banknote className="h-4 w-4 text-amber-600" />
                      <span>Pay when your order arrives</span>
                    </div>
                    <p className="text-[11px] text-amber-800 dark:text-amber-400">
                      You can pay via Cash or POS with the delivery rider upon arrival in {formData.city || 'your location'}.
                    </p>
                  </div>
                )}
              </div>

              {/* Order total & Breakdown in Naira */}
              <div className="rounded-2xl bg-[#F8FAFC] dark:bg-[#27272A] p-4 text-xs space-y-2 border border-[#CBD5E1] dark:border-[#333]">
                <div className="flex justify-between text-[#475569] dark:text-[#94A3B8] font-medium">
                  <span>Items Subtotal ({cart.length})</span>
                  <span className="font-bold text-[#0F172A] dark:text-white">{formatNaira(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-[#DC2626] font-medium">
                    <span>Discount</span>
                    <span className="font-bold">-{formatNaira(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[#475569] dark:text-[#94A3B8] font-medium">
                  <span>VAT (7.5%)</span>
                  <span className="font-bold text-[#0F172A] dark:text-white">{formatNaira(vatTax)}</span>
                </div>
                <div className="flex justify-between text-[#475569] dark:text-[#94A3B8] font-medium">
                  <span>Delivery</span>
                  <span className="text-[#16A34A] font-bold">
                    {shipping === 0 ? 'FREE' : formatNaira(shipping)}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-base text-[#0F172A] dark:text-white pt-2 border-t border-[#CBD5E1] dark:border-[#333]">
                  <span>Total</span>
                  <span className="text-[#00A4D6] dark:text-[#00C3F7] font-black text-xl">{formatNaira(total)}</span>
                </div>
              </div>

              {/* Submit Payment Button */}
              <button
                type="submit"
                id="confirm-checkout-btn"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#00C3F7] to-[#008BB4] text-slate-950 hover:opacity-95 py-3.5 text-sm font-bold shadow-lg shadow-[#00C3F7]/25 transition active:scale-98 disabled:opacity-50 cursor-pointer"
              >
                <Lock className="h-4 w-4" />
                <span>
                  {formData.paymentMethod === 'cod'
                    ? `Place Order (${formatNaira(total)})`
                    : `Pay ${formatNaira(total)}`}
                </span>
                <ArrowRight className="h-4 w-4 ml-1" />
              </button>
            </form>
          </>
        ) : step === 'processing' ? (
          /* Payment Processing Spinner Screen */
          <div className="py-12 text-center space-y-5 animate-in fade-in">
            <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#00C3F7]/15 text-[#00A4D6] dark:text-[#00C3F7]">
              <Loader2 className="h-10 w-10 animate-spin" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Processing Order</h3>
              <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                {paymentStatusText}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <ShieldCheck className="h-4 w-4" />
              <span>Safe & Secure Checkout</span>
            </div>
          </div>
        ) : (
          /* Order & Payment Confirmation Step */
          <div className="py-6 text-center space-y-4 animate-in fade-in">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#E3F2DD] text-[#4CAF50] shadow-sm animate-bounce">
              <CheckCircle2 className="h-10 w-10" />
            </div>

            <div>
              <span className="inline-block rounded-full bg-[#E3F2DD] px-3.5 py-1 text-xs font-bold text-[#2E7D32]">
                Order Confirmed • #{orderId}
              </span>
              <h3 className="mt-2 text-2xl font-bold">Thank you, {formData.name || 'Valued Customer'}!</h3>
              <p className="mt-1 text-xs text-[#8A8A94] max-w-sm mx-auto">
                Your order of <strong className="text-slate-900 dark:text-white">{formatNaira(total)}</strong> has been placed. A confirmation email has been sent to{' '}
                <span className="font-semibold text-[#1F1F23] dark:text-white">
                  {formData.email}
                </span>
                .
              </p>
            </div>

            <div className="rounded-2xl border border-[#EDEDF2] dark:border-[#27272A] p-4 text-left text-xs space-y-2.5 bg-[#FAF9FC] dark:bg-[#27272A]">
              <div className="flex items-center justify-between font-semibold">
                <span>Estimated Delivery</span>
                <span className="text-[#4CAF50] font-bold">1 - 2 Business Days</span>
              </div>
              <div className="text-[#8A8A94]">
                Delivery Address:{' '}
                <span className="text-[#1F1F23] dark:text-white font-medium">
                  {formData.address || 'Address provided'}, {formData.city || 'Lagos'}, {formData.state}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-[#333]">
                <span className="text-slate-500">Payment</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {formData.paymentMethod === 'cod' ? 'Pay on Delivery' : 'Online Payment'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={handleFinish}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#00C3F7] hover:bg-[#00B4E6] text-slate-950 px-7 py-3 text-xs font-bold shadow-md transition cursor-pointer"
              >
                <ShoppingBag className="h-4 w-4" />
                <span>Continue Shopping</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
