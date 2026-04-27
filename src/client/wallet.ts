import { InjectedXianWallet } from "@xian-tech/provider";
import { useCallback, useEffect, useState } from "react";

import type { GovernanceLayer, ProposalDetail } from "../shared/types";

export interface WalletState {
  wallet: InjectedXianWallet | null;
  account: string | null;
  chainId: string | null;
  status: "idle" | "missing" | "connected" | "error";
  error: string | null;
}

export function useXianWallet() {
  const [state, setState] = useState<WalletState>({
    wallet: null,
    account: null,
    chainId: null,
    status: "idle",
    error: null
  });

  const connect = useCallback(async () => {
    try {
      const wallet = await InjectedXianWallet.waitForInjected({ timeoutMs: 800 });
      if (!wallet) {
        setState((current) => ({
          ...current,
          status: "missing",
          error: "No injected Xian wallet found"
        }));
        return;
      }
      const [account] = await wallet.connect();
      const chainId = await wallet.getChainId();
      setState({
        wallet,
        account: account ?? null,
        chainId,
        status: "connected",
        error: null
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : "wallet connection failed"
      }));
    }
  }, []);

  useEffect(() => {
    const wallet = state.wallet;
    if (!wallet) {
      return;
    }
    const handleAccounts = (accounts: unknown) => {
      if (Array.isArray(accounts) && typeof accounts[0] === "string") {
        setState((current) => ({ ...current, account: accounts[0] }));
      }
    };
    const handleChain = (chainId: unknown) => {
      if (typeof chainId === "string") {
        setState((current) => ({ ...current, chainId }));
      }
    };
    wallet.on("accountsChanged", handleAccounts);
    wallet.on("chainChanged", handleChain);
    return () => {
      wallet.removeListener("accountsChanged", handleAccounts);
      wallet.removeListener("chainChanged", handleChain);
    };
  }, [state.wallet]);

  return { ...state, connect };
}

export function canVote(proposal: ProposalDetail, account: string | null): boolean {
  if (!account || proposal.status !== "pending") {
    return false;
  }
  const record = proposal.votes.find((vote) => vote.voter === account);
  return Boolean(record && record.weight > 0 && record.vote === null);
}

export async function submitVote(
  wallet: InjectedXianWallet,
  chainId: string,
  proposal: ProposalDetail,
  support: boolean,
) {
  const call = voteCallFor(proposal.layer, proposal.proposalId, support);
  return wallet.sendCall(
    {
      chainId,
      contract: call.contract,
      function: call.function,
      kwargs: call.kwargs
    },
    { mode: "checktx", waitForTx: true },
  );
}

function voteCallFor(layer: GovernanceLayer, proposalId: number, support: boolean) {
  if (layer === "protocol") {
    return {
      contract: "governance",
      function: "vote",
      kwargs: { proposal_id: proposalId, support }
    };
  }
  return {
    contract: "masternodes",
    function: "vote",
    kwargs: { proposal_id: proposalId, vote: support ? "yes" : "no" }
  };
}
