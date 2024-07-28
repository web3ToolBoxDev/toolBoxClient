import React from 'react';
import Layout from './pages/layout';
import Introduction from './pages/introduction';
import WalletManage from './pages/walletManage';
import TaskManage from './pages/taskManage';
import DefaultTask from './pages/defaultTask';

import { createHashRouter } from 'react-router-dom'; // 导入 createHashRouter

const router = createHashRouter([ // 使用 createHashRouter 替代 createBrowserRouter
  {path:"/", element:<Layout Child={Introduction}/>},
  {path:"/walletManage", element:<Layout Child={WalletManage} />},
  {path:"/taskManage", element:<Layout Child={TaskManage} />},
  {path:"/defaultTask", element:<Layout Child={DefaultTask} />},
]);

export default router;
