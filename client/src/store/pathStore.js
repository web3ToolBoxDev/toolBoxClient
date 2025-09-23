import {create} from 'zustand';
import APIManager from '../utils/api';
const api = APIManager.getInstance();

const usePathStore = create((set) => ({
  savePath: '',
  chromePath: '',
  walletScriptDirectory: '',
  setSavePath: (path) => set({ savePath: path }),
  setChromePath: (path) => set({ chromePath: path }),
  setWalletScriptDirectory: (directory) => set({ walletScriptDirectory: directory }),

  // 分别拉取各路径配置
  fetchSavePath: async () => {
    try {
      const res = await api.getSavePath();
      if (res && res.path) {
        set({ savePath: res.path });
      } else {
        set({ savePath: '' });
      }
    } catch (e) {
      set({ savePath: '' });
    }
  },
  fetchChromePath: async () => {
    try {
      const res = await api.getChromePath();
      if (res && res.path) {
        set({ chromePath: res.path });
      } else {
        set({ chromePath: '' });
      }
    } catch (e) {
      set({ chromePath: '' });
    }
  },
  fetchWalletScriptDirectory: async () => {
    try {
      const res = await api.getWalletScriptDirectory();
      if (res && res.directory) {
        set({ walletScriptDirectory: res.directory });
      } else {
        set({ walletScriptDirectory: '' });
      }
    } catch (e) {
      set({ walletScriptDirectory: '' });
    }
  },
  fetchPaths: async () => {
    await Promise.all([
      usePathStore.getState().fetchSavePath(),
      usePathStore.getState().fetchChromePath(),
      usePathStore.getState().fetchWalletScriptDirectory(),
    ]);
  },  

}));

export default usePathStore;