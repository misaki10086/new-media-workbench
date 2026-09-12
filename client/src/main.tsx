import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './styles.css';

dayjs.locale('zh-cn');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#167458',
          colorInfo: '#167458',
          colorSuccess: '#168c5b',
          colorWarning: '#c77a16',
          colorError: '#cf3c4f',
          borderRadius: 6,
          fontFamily: "Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif",
        },
        components: {
          Layout: { headerBg: '#ffffff', siderBg: '#ffffff', bodyBg: '#f5f6f4' },
          Menu: { itemBorderRadius: 4, itemSelectedBg: '#e8f2ee', itemSelectedColor: '#125f49' },
        },
      }}
    >
      <AntApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
