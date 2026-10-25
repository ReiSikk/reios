'use client';

import { Eye, EyeOff, Landmark } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import type { LhvDashboardData } from '@/lib/integrations/lhv/types';
import { reconnectLhvTokens } from '@/lib/integrations/lhv/actions';

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-EE', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function PrivateAmount({
  amount,
  currency,
  visible,
  className,
}: {
  amount: number;
  currency: string;
  visible: boolean;
  className: string;
}) {
  return (
    <div className={`relative inline-flex min-h-6 items-center leading-tight ${className}`}>
      <span>{formatMoney(amount, currency)}</span>
      {!visible && (
        <div
          className="absolute -inset-x-1 top-1/2 z-10 h-6 -translate-y-1/2 rounded-md bg-[#1a1b1e]/45 backdrop-blur-md"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

export function LhvAccountsSection({ data }: { data: LhvDashboardData }) {
  const [balancesVisible, setBalancesVisible] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const revealVariants = {
    hidden: { opacity: prefersReducedMotion ? 1 : 0, y: prefersReducedMotion ? 0 : 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: prefersReducedMotion ? 0 : 0.38, ease: 'easeOut' as const },
    },
  };

  return (
    <motion.section
      className="dashboard-card px-[26px] py-[25px]"
      aria-labelledby="lhv-accounts-heading"
      variants={revealVariants}
    >
      <div className="section-heading compact">
        <h2 id="lhv-accounts-heading">
          <Landmark size={19} /> LHV Overview
        </h2>
        <button
          className="grid size-9 shrink-0 place-items-center rounded-full border border-[#383a40] bg-[#1a1b1e] text-[#b5d9f1] transition-colors hover:border-[rgba(145,201,241,0.55)] hover:bg-[rgba(145,201,241,0.12)] hover:text-[#d4ecfc] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--reios-blue)]"
          type="button"
          aria-label={balancesVisible ? 'Hide LHV balances' : 'Show LHV balances'}
          aria-pressed={balancesVisible}
          title={balancesVisible ? 'Hide balances' : 'Show balances'}
          onClick={() => setBalancesVisible((visible) => !visible)}
        >
          {balancesVisible ? (
            <EyeOff size={18} aria-hidden="true" />
          ) : (
            <Eye size={18} aria-hidden="true" />
          )}
        </button>
      </div>

      {data.status === 'unconfigured' && (
        <div className="integration-empty">
          Add your LHV API access and refresh tokens to the server environment to connect accounts.
        </div>
      )}
      {data.status === 'reconnect' && (
        <div className="integration-state">
          <p>
            LHV authorization needs renewal. Refresh your API tokens and update the server
            environment.
          </p>
          <form className="m-0" action={reconnectLhvTokens}>
            <button className="btn-secondary" type="submit">
              Reload tokens from environment
            </button>
          </form>
          <a
            className="btn-secondary"
            href="https://api.lhv.ai/api-access"
            target="_blank"
            rel="noreferrer"
          >
            Get LHV API tokens
          </a>
        </div>
      )}
      {data.status === 'error' && (
        <div className="integration-empty">LHV account data is temporarily unavailable.</div>
      )}
      {data.status === 'connected' && (
        <>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {data.accounts.map((account) => (
              <li
                className="flex min-w-0 items-center justify-between gap-3.5 rounded-[10px] border border-[#2b2c30] bg-[#1a1b1e] px-3.5 py-3"
                key={account.id}
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold">
                    {account.name}
                  </strong>
                </span>
                <PrivateAmount
                  amount={account.availableBalance}
                  currency={account.currency}
                  visible={balancesVisible}
                  className="shrink-0 text-[15px] font-bold tabular-nums"
                />
              </li>
            ))}
            <li className="flex min-w-0 items-center justify-between gap-3.5 rounded-[10px] border border-[rgba(145,201,241,0.22)] bg-[linear-gradient(110deg,rgba(145,201,241,0.1),#1a1b1e_75%)] px-3.5 py-3">
              <span className="flex min-w-0 flex-col gap-1">
                <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold text-[#c6e5fb]">
                  Stocks &amp; instruments
                </strong>
              </span>
              {data.holdingsStatus === 'connected' &&
              data.investmentValue !== null &&
              data.investmentCurrency ? (
                <PrivateAmount
                  amount={data.investmentValue}
                  currency={data.investmentCurrency}
                  visible={balancesVisible}
                  className="shrink-0 text-[15px] font-bold tabular-nums"
                />
              ) : (
                <strong className="shrink-0 text-[15px] font-bold">Unavailable</strong>
              )}
            </li>
          </ul>

          {data.totalAssets !== null && data.investmentCurrency ? (
            <div className="mt-4 flex items-baseline justify-between gap-3 rounded-xl border border-[rgba(145,201,241,0.22)] bg-[linear-gradient(115deg,rgba(145,201,241,0.12),rgba(26,27,30,0.82))] px-4 py-[15px] tabular-nums">
              <span className="text-xs font-semibold tracking-[0.07em] text-[#c4c8ce] uppercase">
                Total net worth
              </span>
              <PrivateAmount
                amount={data.totalAssets}
                currency={data.investmentCurrency}
                visible={balancesVisible}
                className="shrink-0 text-[19px] font-extrabold text-[var(--reios-blue)]"
              />
            </div>
          ) : (
            <p className="mt-3 text-xs leading-relaxed text-[var(--reios-muted)]">
              {data.holdingsStatus === 'permission'
                ? 'Enable account read access for LHV investments to calculate total net worth.'
                : data.holdingsStatus === 'error'
                  ? 'Investment data is temporarily unavailable, so total net worth could not be calculated.'
                  : 'The selected accounts and investments use different currencies, so total net worth could not be combined.'}
            </p>
          )}
        </>
      )}
    </motion.section>
  );
}
