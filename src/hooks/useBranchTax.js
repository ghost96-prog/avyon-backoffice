// src/hooks/useBranchTax.js
// Loads a branch's tax setup. `enabled` === the branch is fiscalised.
import { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';

export function useBranchTax(branchId) {
  const { apiFetch, businessId } = useAppContext();
  const [state, setState] = useState({ enabled: false, taxes: [], loaded: false });

  useEffect(() => {
    if (!businessId || !branchId) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loaded: false }));
    apiFetch(`/business/${businessId}/branches/${branchId}/settings`)
      .then((st) => {
        if (!alive) return;
        setState({
          enabled: st?.taxEnabled === true,
          taxes: Array.isArray(st?.taxes) ? st.taxes : [],
          loaded: true,
        });
      })
      .catch(() => { if (alive) setState({ enabled: false, taxes: [], loaded: true }); });
    return () => { alive = false; };
  }, [apiFetch, businessId, branchId]);

  return state;
}
