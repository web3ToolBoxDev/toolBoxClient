import { create } from 'zustand';
import APIManager from '../utils/api';
const api = APIManager.getInstance();

const useFingerPrintStore = create((set) => ({
  fingerPrints: {},
  setFingerPrints: (data) => set({ fingerPrints: data }),
  clearFingerPrints: () => set({ fingerPrints: {} }),
  fetchFingerPrints: async () => {
    const res = await api.getFingerPrints();
    if (res && res.success && res.data) {
      set({ fingerPrints: res.data });
    } else {
      set({ fingerPrints: {} });
    }
  },
}));

export default useFingerPrintStore;