import {
  BarChartOutlined,
  FileTextOutlined,
  MenuFoldOutlined,
  PlusSquareOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Button, Drawer, Grid, Layout, Menu, Space, Tooltip, Typography } from 'antd';
import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

const { Header, Content, Sider } = Layout;

const navigation = [
  { key: '/contents', icon: <FileTextOutlined />, label: '内容管理' },
  { key: '/contents/new', icon: <PlusSquareOutlined />, label: '新建内容' },
  { key: '/accounts', icon: <TeamOutlined />, label: '平台账号' },
  { key: '/stats', icon: <BarChartOutlined />, label: '数据统计' },
];

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark"><FileTextOutlined /></div>
      <div className="brand-copy">
        <strong>内容工作台</strong>
        <span>MEDIA DESK</span>
      </div>
    </div>
  );
}

export function AppLayout() {
  const screens = Grid.useBreakpoint();
  const mobile = !screens.lg;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const selectedKey = location.pathname.startsWith('/contents/new') || location.pathname.endsWith('/edit')
    ? '/contents/new'
    : navigation.find((item) => location.pathname.startsWith(item.key))?.key ?? '/contents';

  const menu = (
    <Menu
      mode="inline"
      selectedKeys={[selectedKey]}
      items={navigation}
      onClick={({ key }) => {
        navigate(key);
        setDrawerOpen(false);
      }}
    />
  );

  return (
    <Layout className="app-shell">
      {!mobile ? (
        <Sider width={232} theme="light" className="app-sider">
          <Brand />
          <nav aria-label="主导航">{menu}</nav>
          <div className="sider-foot">MVP · 模拟发布环境</div>
        </Sider>
      ) : (
        <Drawer
          placement="left"
          width={264}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          styles={{ body: { padding: 0 } }}
          title={<Brand />}
        >
          <nav aria-label="主导航">{menu}</nav>
        </Drawer>
      )}

      <Layout>
        <Header className="app-header">
          <Space size={12}>
            {mobile ? (
              <Tooltip title="打开导航">
                <Button type="text" icon={<MenuFoldOutlined />} onClick={() => setDrawerOpen(true)} aria-label="打开导航" />
              </Tooltip>
            ) : null}
            {mobile ? <Typography.Text strong>内容工作台</Typography.Text> : null}
          </Space>
        </Header>
        <Content className="app-content"><Outlet /></Content>
      </Layout>
    </Layout>
  );
}
