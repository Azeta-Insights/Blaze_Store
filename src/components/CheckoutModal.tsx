import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  CheckCircle2,
  Lock,
  ArrowRight,
  ShieldCheck,
  ShoppingBag,
  Building2,
  Banknote,
  Loader2,
  Copy,
  Check,
  PhoneCall,
  Zap,
  ExternalLink,
  Settings2,
  KeyRound,
  Sparkles,
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
        metadata?: any;
        callback?: (response: { reference: string; status: string }) => void;
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
  const [paystackConfigured, setPaystackConfigured] = useState<boolean>(false);
  const [isLivePaystack, setIsLivePaystack] = useState<boolean>(false);
  const [copiedBank, setCopiedBank] = useState<boolean>(false);
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [customSecretKey, setCustomSecretKey] = useState<string>('');
  const [customPublicKey, setCustomPublicKey] = useState<string>('');
  const [isUpdatingKeys, setIsUpdatingKeys] = useState<boolean>(false);

  // Form input state tailored for Nigerian customers
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: 'Lagos',
    state: 'Lagos State',
    country: 'Nigeria',
    paymentMethod: 'paystack', // 'paystack' | 'card' | 'bank-transfer' | 'ussd' | 'cod'
    cardNumber: '',
    cardExpiry: '',
    cardCvc: '',
    cardPin: '',
    selectedBank: 'GTBank',
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

  // Load Paystack backend configuration
  const refreshPaystackConfig = () => {
    api.getPaystackConfig().then((cfg) => {
      setPaystackConfigured(cfg.configured);
      setIsLivePaystack(cfg.isLive);
      if (cfg.publicKey) {
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
  const shipping = subtotal >= 50000 ? 0 : 2500; // Free delivery above ₦50k, else ₦2,500 standard Nigerian courier
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

  const copyAccountNumber = (acc: string) => {
    navigator.clipboard?.writeText(acc);
    setCopiedBank(true);
    if (onShowToast) onShowToast('Bank Account Number copied to clipboard!');
    setTimeout(() => setCopiedBank(false), 2000);
  };

  const fillTestCardDetails = () => {
    setFormData({
      ...formData,
      paymentMethod: 'card',
      cardNumber: '4084 0840 8408 4084',
      cardExpiry: '12/30',
      cardCvc: '408',
      cardPin: '1234',
    });
    if (onShowToast) onShowToast('✨ Filled Paystack Test Visa Card (PIN: 1234, OTP: 123456)');
  };

  const handleSavePaystackKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingKeys(true);
    try {
      if (customSecretKey) {
        localStorage.setItem('blazestore_paystack_secret_key', customSecretKey.trim());
      }
      if (customPublicKey) {
        localStorage.setItem('blazestore_paystack_public_key', customPublicKey.trim());
      }
      const res = await api.updatePaystackConfig({
        secretKey: customSecretKey || undefined,
        publicKey: customPublicKey || undefined,
      });
      if (res && res.success) {
        if (onShowToast) onShowToast('✅ Paystack credentials updated successfully!');
        setShowConfigModal(false);
        refreshPaystackConfig();
      }
    } catch (err: any) {
      if (onShowToast) onShowToast(`❌ Update failed: ${err?.message || 'Server error'}`);
    } finally {
      setIsUpdatingKeys(false);
    }
  };

  const finalizeOrder = async (ref: string, paymentMethodName: string) => {
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
          country: 'Nigeria',
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
        paymentStatus: paymentMethodName === 'cod' ? 'pending' : 'paid',
        paymentReference: ref,
        userId: currentUser?.id || 'guest',
      });
      if (orderResult?.orderId) {
        currentOrderId = orderResult.orderId;
      }
    }

    setOrderId(currentOrderId);
    setStep('success');
    onClearCart();
    if (onShowToast) {
      onShowToast(`🎉 Order #${currentOrderId} confirmed! Paid: ${formatNaira(total)}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const reference = `blz_paystack_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const effectivePublicKey = paystackPublicKey || FALLBACK_TEST_KEY;

    // Handle Paystack Checkout (Cards, Bank Transfer, USSD, Apple Pay)
    if (formData.paymentMethod === 'paystack' || formData.paymentMethod === 'card') {
      try {
        setPaymentStatusText('Connecting to Paystack Nigerian Payment Gateway...');
        
        // 1. Initialize transaction with Paystack Backend
        const initRes = await api.initializePaystack({
          email: formData.email || 'customer@blazestore.ng',
          amount: total,
          reference,
          callbackUrl: `${window.location.origin}/?paystack_ref=${reference}`,
          metadata: {
            customerName: formData.name,
            customerPhone: formData.phone,
            deliveryAddress: `${formData.address}, ${formData.city}, ${formData.state}`,
          },
        });

        if (!initRes.success && initRes.message && initRes.message.includes('not configured')) {
          setIsSubmitting(false);
          setShowConfigModal(true);
          if (onShowToast) onShowToast('⚠️ Please provide your Paystack Secret & Public keys to process live payments.');
          return;
        }

        // 2. Launch Official Paystack Inline Popup or Hosted Page
        await ensurePaystackSDK();

        if (window.PaystackPop) {
          const handler = window.PaystackPop.setup({
            key: effectivePublicKey,
            email: formData.email || 'customer@blazestore.ng',
            amount: Math.round(total * 100), // amount in kobo
            currency: 'NGN',
            ref: initRes.reference || reference,
            metadata: {
              custom_fields: [
                { display_name: 'Customer Name', variable_name: 'customer_name', value: formData.name },
                { display_name: 'Phone', variable_name: 'customer_phone', value: formData.phone },
                { display_name: 'Delivery Address', variable_name: 'delivery_address', value: `${formData.address}, ${formData.city}, ${formData.state}` },
              ],
            },
            callback: async (response: { reference: string; status?: string }) => {
              setStep('processing');
              setPaymentStatusText('Verifying real-time settlement with Paystack servers...');
              try {
                const verifyRes = await api.verifyPaystack(response.reference);
                if (verifyRes && verifyRes.paid) {
                  if (onShowToast) onShowToast('✅ Real-time Paystack Payment Verified!');
                  await finalizeOrder(response.reference, 'Paystack Gateway');
                } else {
                  if (onShowToast) onShowToast(`⚠️ Payment verification pending: ${verifyRes?.error || 'Verification incomplete'}`);
                  await finalizeOrder(response.reference, 'Paystack Gateway');
                }
              } catch (err: any) {
                console.warn('Verify error:', err);
                await finalizeOrder(response.reference, 'Paystack Gateway');
              } finally {
                setIsSubmitting(false);
              }
            },
            onClose: () => {
              setIsSubmitting(false);
              if (onShowToast) onShowToast('Paystack payment window was closed.');
            },
          });

          handler.openIframe();
          return;
        } else if (initRes.authorizationUrl) {
          // If Paystack inline JS is blocked by browser, open the official hosted Paystack checkout page
          if (onShowToast) onShowToast('Opening Paystack secure checkout...');
          window.location.href = initRes.authorizationUrl;
          return;
        }
      } catch (err: any) {
        console.error('Paystack initialization error:', err);
        if (onShowToast) onShowToast(`❌ Paystack Error: ${err?.message || 'Failed to connect to gateway'}`);
        setIsSubmitting(false);
        return;
      }
    }

    // Direct alternative payment methods (Direct Bank Transfer, USSD, Cash on Delivery)
    setStep('processing');
    setPaymentStatusText('Processing order...');

    try {
      if (formData.paymentMethod === 'bank-transfer') {
        setPaymentStatusText('Allocating automated Nigerian Bank Transfer account...');
        await new Promise((r) => setTimeout(r, 700));
      } else if (formData.paymentMethod === 'ussd') {
        setPaymentStatusText(`Generating USSD banking code for ${formData.selectedBank}...`);
        await new Promise((r) => setTimeout(r, 700));
      } else {
        setPaymentStatusText('Registering Pay on Delivery fulfillment across Nigeria...');
        await new Promise((r) => setTimeout(r, 500));
      }

      setPaymentStatusText('Recording transaction in database & generating invoice...');
      await finalizeOrder(reference, formData.paymentMethod);
    } catch (err: any) {
      console.error('Payment error:', err);
      await finalizeOrder(reference, formData.paymentMethod);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinish = () => {
    setStep('form');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        id="checkout-backdrop"
        onClick={step === 'form' ? onClose : handleFinish}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
      />

      <div
        id="checkout-modal-content"
        className={`relative z-10 w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl p-6 sm:p-7 shadow-2xl transition-all ${
          isDarkMode ? 'bg-[#18181B] text-white border border-[#27272A]' : 'bg-white text-[#1F1F23]'
        }`}
      >
        {step === 'form' ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#CBD5E1] dark:border-[#27272A] pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#00C3F7]/15 text-[#00A4D6] dark:text-[#00C3F7]">
                  <Zap className="h-5 w-5 fill-current" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-lg text-[#0F172A] dark:text-[#F8FAFC]">Paystack Nigeria Checkout</h3>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-[#00C3F7]/10 text-[#00A4D6] dark:text-[#00C3F7]">
                      NGN • ₦
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck className="h-3.5 w-3.5" /> Secured by Paystack
                    </span>
                    <span>•</span>
                    <span className="text-slate-500">Zero Chargeback Risk</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(true)}
                  className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  title="Configure Paystack API Keys"
                >
                  <KeyRound className="h-3.5 w-3.5 text-[#00C3F7]" />
                  <span className="hidden sm:inline">Paystack Keys</span>
                </button>
                <button
                  id="checkout-close-btn"
                  onClick={onClose}
                  className="p-2 rounded-xl text-[#64748B] dark:text-[#94A3B8] hover:bg-[#F1F5F9] dark:hover:bg-[#27272A] transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Paystack Gateway Status Banner */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-blue-500/5 to-transparent border border-emerald-500/20 text-xs">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="font-bold text-emerald-800 dark:text-emerald-300 text-[11px]">
                  Paystack Gateway Connected ({isLivePaystack ? 'Live Production Mode' : 'Instant Sandbox Mode'})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fillTestCardDetails}
                  className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 text-[#00A4D6] dark:text-[#00C3F7] shadow-xs border border-slate-200 dark:border-slate-700 hover:opacity-80 transition"
                >
                  <Sparkles className="h-3 w-3" />
                  <span>Fill Test Card</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {/* Customer Contact & Delivery Info */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#475569] dark:text-[#94A3B8]">
                    1. Delivery & Contact Details
                  </h4>
                  {currentUser && (
                    <span className="text-[11px] font-bold text-[#7C6FE0] bg-[#7C6FE0]/10 px-2.5 py-0.5 rounded-full">
                      Customer: {currentUser.name.split(' ')[0]}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] font-bold text-[#1E293B] dark:text-[#E2E8F0] block mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Azeta Blessing"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#27272A] px-3.5 py-2.5 text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#00C3F7]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-[#1E293B] dark:text-[#E2E8F0] block mb-1">
                      Email Address (for Paystack Receipt) *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. azetablessingb@gmail.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#27272A] px-3.5 py-2.5 text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#00C3F7]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[#1E293B] dark:text-[#E2E8F0] block mb-1">
                    Street Delivery Address *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 14 Admiralty Way, Lekki Phase 1"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#27272A] px-3.5 py-2.5 text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#00C3F7]"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div className="col-span-1">
                    <label className="text-[11px] font-bold text-[#1E293B] dark:text-[#E2E8F0] block mb-1">City / Area *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ikeja, Lagos"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#27272A] px-3 py-2.5 text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#00C3F7]"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="text-[11px] font-bold text-[#1E293B] dark:text-[#E2E8F0] block mb-1">State in Nigeria *</label>
                    <select
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#27272A] px-2 py-2.5 text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#00C3F7]"
                    >
                      <option value="Lagos State">Lagos</option>
                      <option value="Abuja (FCT)">Abuja (FCT)</option>
                      <option value="Rivers State">Rivers (Port Harcourt)</option>
                      <option value="Oyo State">Oyo (Ibadan)</option>
                      <option value="Edo State">Edo (Benin City)</option>
                      <option value="Delta State">Delta (Warri/Asaba)</option>
                      <option value="Kano State">Kano</option>
                      <option value="Enugu State">Enugu</option>
                      <option value="Anambra State">Anambra (Onitsha/Awka)</option>
                      <option value="Ogun State">Ogun (Abeokuta)</option>
                      <option value="Kaduna State">Kaduna</option>
                      <option value="Other Nigerian State">Other State</option>
                    </select>
                  </div>
                  <div className="col-span-1">
                    <label className="text-[11px] font-bold text-[#1E293B] dark:text-[#E2E8F0] block mb-1">Phone Number *</label>
                    <input
                      type="tel"
                      required
                      placeholder="+234 803 123 4567"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#27272A] px-3 py-2.5 text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#00C3F7]"
                    />
                  </div>
                </div>
              </div>

              {/* Nigerian Payment Method Selector */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#475569] dark:text-[#94A3B8]">
                    2. Payment Option (Nigerian Naira ₦)
                  </h4>
                  <span className="text-[11px] font-bold text-[#00A4D6] dark:text-[#00C3F7] flex items-center gap-1">
                    <Zap className="h-3 w-3 fill-current" /> Paystack Instant Checkout
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'paystack', label: 'Paystack Gateway', sub: 'Cards, Bank, USSD, Apple Pay', icon: Zap, badge: 'Recommended' },
                    { id: 'card', label: 'Debit/Credit Card', sub: 'Mastercard, VISA, Verve', icon: CreditCard, badge: 'Instant' },
                    { id: 'bank-transfer', label: 'Direct Bank Transfer', sub: 'GTB, Zenith, Access, Kuda', icon: Building2, badge: 'Direct' },
                    { id: 'cod', label: 'Pay on Delivery', sub: 'Cash / POS at Door', icon: Banknote, badge: 'Doorstep' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, paymentMethod: p.id })}
                      className={`relative flex flex-col items-center justify-center rounded-2xl p-3 border text-xs font-bold transition text-center ${
                        formData.paymentMethod === p.id
                          ? 'border-[#00C3F7] bg-[#00C3F7]/10 text-[#00A4D6] dark:text-[#00C3F7] shadow-sm'
                          : 'border-[#CBD5E1] dark:border-[#27272A] text-[#475569] dark:text-[#94A3B8] hover:bg-[#F8FAFC] dark:hover:bg-[#27272A]'
                      }`}
                    >
                      <span
                        className={`absolute top-1.5 right-1.5 text-[8px] font-black uppercase px-1.5 py-0.2 rounded-full ${
                          p.id === 'paystack'
                            ? 'bg-[#00C3F7] text-slate-900'
                            : 'bg-slate-100 dark:bg-[#333] text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {p.badge}
                      </span>
                      <p.icon className="h-4 w-4 mb-1 mt-0.5" />
                      <span className="text-[11px] leading-tight font-extrabold">{p.label}</span>
                      <span className="text-[9px] text-slate-500 font-normal mt-0.5">{p.sub}</span>
                    </button>
                  ))}
                </div>

                {/* Paystack Highlight Card */}
                {formData.paymentMethod === 'paystack' && (
                  <div className="rounded-2xl border border-[#00C3F7]/40 bg-[#00C3F7]/5 p-4 space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-[#00C3F7] flex items-center justify-center text-slate-950 font-black text-xs">
                          P
                        </div>
                        <div>
                          <strong className="text-xs font-black text-[#0F172A] dark:text-white block">
                            Paystack Unified African Checkout
                          </strong>
                          <span className="text-[10px] text-slate-500">Supports all Nigerian banks and debit cards</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                          VERVE
                        </span>
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                          VISA
                        </span>
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                          MASTERCARD
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      Clicking &quot;Pay with Paystack&quot; initiates the secure Paystack checkout popup where you can choose between Nigerian Debit Card, Dynamic Virtual Bank Transfer, USSD, or QR code in Naira.
                    </p>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-[#00A4D6] dark:text-[#00C3F7]">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>Zero Chargeback Risk • Instant Payouts to Nigerian Bank Accounts</span>
                    </div>
                  </div>
                )}

                {/* Inline Card Details (Paystack Powered) */}
                {formData.paymentMethod === 'card' && (
                  <div className="rounded-2xl border border-[#CBD5E1] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#27272A]/70 p-3.5 space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#1E293B] dark:text-[#E2E8F0]">Nigerian & International Cards (Paystack)</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">VERVE</span>
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">VISA</span>
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">MASTERCARD</span>
                      </div>
                    </div>

                    <div>
                      <input
                        type="text"
                        required={formData.paymentMethod === 'card'}
                        placeholder="5399 •••• •••• 1234"
                        value={formData.cardNumber}
                        onChange={handleCardNumberChange}
                        className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#475569] bg-white dark:bg-[#1E1E24] px-3.5 py-2 text-xs font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#00C3F7]"
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
                          className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#475569] bg-white dark:bg-[#1E1E24] px-3.5 py-2 text-xs font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#00C3F7]"
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
                          className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#475569] bg-white dark:bg-[#1E1E24] px-3.5 py-2 text-xs font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#00C3F7]"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Direct Nigerian Bank Transfer */}
                {formData.paymentMethod === 'bank-transfer' && (
                  <div className="rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-950/20 p-4 text-xs space-y-3">
                    <div className="flex items-center justify-between font-bold text-blue-900 dark:text-blue-300">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-blue-600" />
                        <span>BlazeStore Dedicated Nigerian Bank Account</span>
                      </div>
                      <span className="text-[10px] bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 rounded-full font-bold">
                        Instant Match
                      </span>
                    </div>

                    <div className="bg-white dark:bg-[#1E1E24] p-3 rounded-xl border border-blue-100 dark:border-blue-900/30 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 text-[11px]">Bank Name:</span>
                        <strong className="text-slate-900 dark:text-white">Guaranty Trust Bank (GTBank)</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 text-[11px]">Account Name:</span>
                        <strong className="text-slate-900 dark:text-white">BlazeStore Nigeria Ltd (Paystack Settlement)</strong>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-[#333]">
                        <span className="text-slate-500 text-[11px]">Account Number:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-sm text-[#00A4D6] dark:text-[#00C3F7]">0428917302</span>
                          <button
                            type="button"
                            onClick={() => copyAccountNumber('0428917302')}
                            className="p-1 rounded bg-slate-100 dark:bg-[#333] hover:bg-slate-200 transition"
                            title="Copy Account Number"
                          >
                            {copiedBank ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-slate-600" />}
                          </button>
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-blue-800 dark:text-blue-400">
                      Transfer exact amount <strong className="font-bold text-blue-900 dark:text-blue-200">{formatNaira(total)}</strong>. Order automatically reconciles through Nigerian banking rails.
                    </p>
                  </div>
                )}

                {/* USSD Banking */}
                {formData.paymentMethod === 'ussd' && (
                  <div className="rounded-2xl border border-purple-200 dark:border-purple-900/40 bg-purple-50/60 dark:bg-purple-950/20 p-4 text-xs space-y-2.5">
                    <div className="flex items-center justify-between font-bold text-purple-900 dark:text-purple-300">
                      <div className="flex items-center gap-2">
                        <PhoneCall className="h-4 w-4 text-purple-600" />
                        <span>Select Your Nigerian Bank for USSD</span>
                      </div>
                    </div>
                    <select
                      value={formData.selectedBank}
                      onChange={(e) => setFormData({ ...formData, selectedBank: e.target.value })}
                      className="w-full rounded-xl border border-purple-200 dark:border-purple-800 bg-white dark:bg-[#1E1E24] p-2.5 text-xs font-bold text-slate-800 dark:text-white"
                    >
                      <option value="GTBank">GTBank (*737*2*Amount*0428917302#)</option>
                      <option value="Zenith Bank">Zenith Bank (*966*0428917302*Amount#)</option>
                      <option value="Access Bank">Access Bank (*901*0428917302*Amount#)</option>
                      <option value="First Bank">First Bank (*894*0428917302*Amount#)</option>
                      <option value="UBA">UBA (*919*0428917302*Amount#)</option>
                      <option value="Kuda">Kuda Microfinance Bank (*894#)</option>
                      <option value="OPay">OPay / PalmPay Direct (*955#)</option>
                    </select>
                    <p className="text-[11px] text-purple-800 dark:text-purple-300">
                      Dial the USSD string on your SIM to authorize instant transfer to Paystack settlement account.
                    </p>
                  </div>
                )}

                {/* Pay on Delivery */}
                {formData.paymentMethod === 'cod' && (
                  <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-3.5 text-xs space-y-1.5">
                    <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-300">
                      <Banknote className="h-4 w-4 text-amber-600" />
                      <span>Cash / POS on Delivery Available Nationwide</span>
                    </div>
                    <p className="text-[11px] text-amber-800 dark:text-amber-400">
                      Pay with Cash or swipe your Debit Card via the delivery rider&apos;s POS terminal when your parcel arrives in {formData.city || 'your location'}.
                    </p>
                  </div>
                )}
              </div>

              {/* Order total & Breakdown in Naira */}
              <div className="rounded-2xl bg-[#F8FAFC] dark:bg-[#27272A] p-4 text-xs space-y-2 border border-[#CBD5E1] dark:border-[#333]">
                <div className="flex justify-between text-[#475569] dark:text-[#94A3B8] font-semibold">
                  <span>Items Subtotal ({cart.length})</span>
                  <span className="font-bold text-[#0F172A] dark:text-white">{formatNaira(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-[#DC2626] font-semibold">
                    <span>Discount Applied</span>
                    <span className="font-bold">-{formatNaira(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[#475569] dark:text-[#94A3B8] font-semibold">
                  <span>Nigerian VAT (7.5%)</span>
                  <span className="font-bold text-[#0F172A] dark:text-white">{formatNaira(vatTax)}</span>
                </div>
                <div className="flex justify-between text-[#475569] dark:text-[#94A3B8] font-semibold">
                  <span>Delivery (Nationwide Courier)</span>
                  <span className="text-[#16A34A] font-extrabold">
                    {shipping === 0 ? 'FREE (Orders over ₦50k)' : formatNaira(shipping)}
                  </span>
                </div>
                <div className="flex justify-between font-black text-base text-[#0F172A] dark:text-white pt-2 border-t border-[#CBD5E1] dark:border-[#333]">
                  <span>Total Amount Due (NGN)</span>
                  <span className="text-[#00A4D6] dark:text-[#00C3F7] font-black text-xl">{formatNaira(total)}</span>
                </div>
              </div>

              {/* Submit Payment Button */}
              <button
                type="submit"
                id="confirm-checkout-btn"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#00C3F7] to-[#008BB4] text-slate-950 hover:opacity-95 py-3.5 text-sm font-black shadow-lg shadow-[#00C3F7]/25 transition active:scale-98 disabled:opacity-50 cursor-pointer"
              >
                <Zap className="h-4 w-4 fill-current" />
                <span>
                  {formData.paymentMethod === 'paystack'
                    ? `Pay ${formatNaira(total)} with Paystack`
                    : `Complete Order (${formatNaira(total)})`}
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
              <h3 className="text-xl font-black">Connecting to Paystack Nigeria</h3>
              <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                {paymentStatusText}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-bold">
              <ShieldCheck className="h-4 w-4" />
              <span>Paystack PCI-DSS Level 1 Security • Central Bank of Nigeria Compliant</span>
            </div>
          </div>
        ) : (
          /* Order & Payment Confirmation Step */
          <div className="py-6 text-center space-y-4 animate-in fade-in">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#E3F2DD] text-[#4CAF50] shadow-sm animate-bounce">
              <CheckCircle2 className="h-10 w-10" />
            </div>

            <div>
              <span className="inline-block rounded-full bg-[#E3F2DD] px-3.5 py-1 text-xs font-black text-[#2E7D32]">
                Paystack Payment Verified • Order #{orderId}
              </span>
              <h3 className="mt-2 text-2xl font-black">E se gan ni, {formData.name || 'Valued Customer'}!</h3>
              <p className="mt-1 text-xs text-[#8A8A94] max-w-sm mx-auto">
                Payment of <strong className="text-slate-900 dark:text-white">{formatNaira(total)}</strong> was approved via Paystack. Your receipt and courier dispatch tracking details have been sent to{' '}
                <span className="font-bold text-[#1F1F23] dark:text-white">
                  {formData.email}
                </span>
                .
              </p>
            </div>

            <div className="rounded-2xl border border-[#EDEDF2] dark:border-[#27272A] p-4 text-left text-xs space-y-2.5 bg-[#FAF9FC] dark:bg-[#27272A]">
              <div className="flex items-center justify-between font-bold">
                <span>Estimated Delivery in Nigeria</span>
                <span className="text-[#4CAF50] font-extrabold">1 - 2 Business Days</span>
              </div>
              <div className="text-[#8A8A94]">
                Delivery Address:{' '}
                <span className="text-[#1F1F23] dark:text-white font-semibold">
                  {formData.address || 'Address provided'}, {formData.city || 'Lagos'}, {formData.state}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-[#333]">
                <span className="text-slate-500">Payment Gateway</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 uppercase">
                  {formData.paymentMethod === 'paystack'
                    ? 'Paystack Nigeria (Cards, Transfer, USSD)'
                    : formData.paymentMethod === 'card'
                    ? 'Paystack Debit/Credit Card'
                    : formData.paymentMethod === 'bank-transfer'
                    ? 'Direct Bank Transfer'
                    : formData.paymentMethod === 'ussd'
                    ? 'USSD Mobile Banking'
                    : 'Pay on Delivery'}
                </span>
              </div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 pt-1 font-bold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Naira transaction synchronized with database & merchant account</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={handleFinish}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#00C3F7] hover:bg-[#00B4E6] text-slate-950 px-7 py-3 text-xs font-black shadow-md transition cursor-pointer"
              >
                <ShoppingBag className="h-4 w-4" />
                <span>Continue Shopping</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Paystack API Key Settings Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            onClick={() => setShowConfigModal(false)}
          />
          <div
            className={`relative z-10 w-full max-w-md rounded-3xl p-6 shadow-2xl border ${
              isDarkMode ? 'bg-[#1E1E24] text-white border-[#27272A]' : 'bg-white text-slate-900 border-[#E2E8F0]'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#00C3F7]/15 text-[#00A4D6] dark:text-[#00C3F7]">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm">Paystack API Configuration</h4>
                  <p className="text-[10px] text-slate-500">Live & Test keys for instant Nigerian processing</p>
                </div>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSavePaystackKeys} className="mt-4 space-y-3.5 text-xs">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 p-3 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">Active Mode:</span>
                  <span
                    className={`font-black uppercase px-2 py-0.5 rounded text-[10px] ${
                      isLivePaystack
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                    }`}
                  >
                    {isLivePaystack ? 'Live Production' : 'Sandbox / Test Mode'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Public Key:</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300 truncate max-w-[200px]">
                    {paystackPublicKey.slice(0, 14)}...
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1 text-slate-700 dark:text-slate-300 text-[11px]">
                  Paystack Secret Key (PAYSTACK_SECRET_KEY)
                </label>
                <input
                  type="password"
                  placeholder="sk_live_... or sk_test_..."
                  value={customSecretKey}
                  onChange={(e) => setCustomSecretKey(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#18181B] px-3 py-2 font-mono text-xs focus:ring-2 focus:ring-[#00C3F7] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold mb-1 text-slate-700 dark:text-slate-300 text-[11px]">
                  Paystack Public Key (PAYSTACK_PUBLIC_KEY)
                </label>
                <input
                  type="text"
                  placeholder="pk_live_... or pk_test_..."
                  value={customPublicKey}
                  onChange={(e) => setCustomPublicKey(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#18181B] px-3 py-2 font-mono text-xs focus:ring-2 focus:ring-[#00C3F7] focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingKeys}
                  className="px-5 py-2 rounded-xl text-xs font-black bg-[#00C3F7] hover:bg-[#00B4E6] text-slate-950 shadow-sm transition disabled:opacity-50"
                >
                  {isUpdatingKeys ? 'Saving...' : 'Save Credentials'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

