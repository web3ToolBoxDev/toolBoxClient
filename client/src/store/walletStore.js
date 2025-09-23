import { create } from 'zustand';
import APIManager from '../utils/api';
const api = APIManager.getInstance();

const useWalletStore = create((set) => ({
  wallets: [],
  setWallets: (data) => set({ wallets: data }),
  clearWallets: () => set({ wallets: [] }),
  fetchWallets: async () => {
    const res = await api.getAllWallets();
    console.log('getAllWallets res:', res);
    if (res && Array.isArray(res)) {
      const sortedWallets = res
        .slice()
        .sort((a, b) => {
          if ((a.createdAt || 0) !== (b.createdAt || 0)) {
            return (a.createdAt || 0) - (b.createdAt || 0);
          }
        if (a.id < b.id) return -1;
        if (a.id > b.id) return 1;
        return 0;
      })
      .map(wallet => ({ ...wallet }));
      set({ wallets: sortedWallets });
    }
  },
}));

export default useWalletStore;
