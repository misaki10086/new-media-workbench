import { DeleteOutlined, LinkOutlined, PlusOutlined, QuestionCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
  type TableProps,
} from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { accountApi, getErrorMessage, platformAuthApi } from '../api';
import { PageHeader } from '../components/PageHeader';
import { PlatformTag } from '../components/PlatformTag';
import type { AccountInput, PlatformAccount, PlatformAuthStatus } from '../types';

const CONNECTION_MODE_LABELS: Record<PlatformAccount['connectionMode'], { label: string; color: string }> = {
  server: { label: '真实接口 · 服务端凭据', color: 'green' },
  oauth: { label: '真实接口 · 已授权', color: 'blue' },
  manual: { label: '模拟发布', color: 'default' },
};

const PLATFORM_OPTIONS: { value: PlatformAccount['platform']; label: string }[] = [
  { value: 'wechat', label: '微信公众号' },
  { value: 'douyin', label: '抖音' },
  { value: 'xiaohongshu', label: '小红书' },
];

type AccessMode = 'official' | 'manual';

function FieldTip({ title }: { title: ReactNode }) {
  return (
    <Tooltip title={title}>
      <QuestionCircleOutlined style={{ marginLeft: 4, color: '#8a918c' }} aria-label="说明" />
    </Tooltip>
  );
}

const TIPS = {
  accessMode: (
    <>
      官方授权登录：跳转平台官方页面完成登录/授权，或校验平台颁发的密钥，发布时调用平台真实接口。
      <br />
      手动录入：只在本地数据库保存一条模拟账号，用于验证发布流程，不会连接真实平台。
    </>
  ),
  wechatAppId: '登录微信公众平台 → 设置与开发 → 基本配置，成为开发者后即可看到 AppID。',
  wechatAppSecret: (
    <>
      在公众平台「基本配置」页生成或重置 AppSecret（仅管理员可见）。
      <br />
      注意：调用接口的服务器 IP 必须先加入同页的「IP 白名单」，否则绑定会报错。
    </>
  ),
  wechatPublish: (
    <>
      绑定成功后，发布走「草稿箱 → 发布」真实接口。
      <br />
      freepublish 发布权限仅对【已认证】的公众号开放；未认证账号会在发布环节报错（错误信息会记录在发布记录里）。
    </>
  ),
  manualCredential: '仅保存在本地数据库，用于模拟发布流程，不会发送到任何真实平台。',
  douyinPrerequisite: (
    <>
      前置条件：在抖音开放平台（open.douyin.com）创建应用并通过审核、开通 video.create 能力，把 client_key / client_secret 填入
      server/.env 的 DOUYIN_CLIENT_KEY / DOUYIN_CLIENT_SECRET，并在平台登记回调地址
      http://localhost:3000/api/platform-auth/douyin/callback
    </>
  ),
  xhsPrerequisite: (
    <>
      前置条件：在小红书开放平台创建应用并通过审核，把 AppKey / AppSecret 填入 server/.env 的 XHS_APP_KEY / XHS_APP_SECRET，并在平台登记回调地址
      http://localhost:3000/api/platform-auth/xiaohongshu/callback
    </>
  ),
};

const OAUTH_PREREQUISITES: Partial<Record<PlatformAccount['platform'], ReactNode>> = {
  douyin: TIPS.douyinPrerequisite,
  xiaohongshu: TIPS.xhsPrerequisite,
};

export function AccountsPage() {
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [authStatuses, setAuthStatuses] = useState<PlatformAuthStatus[]>([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [wechatConnecting, setWechatConnecting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<AccountInput & { accessMode?: AccessMode; appId?: string; appSecret?: string }>();
  const [messageApi, contextHolder] = message.useMessage();

  const watchedPlatform = Form.useWatch('platform', form) ?? 'wechat';
  const watchedAccessMode: AccessMode = Form.useWatch('accessMode', form) ?? 'official';
  const watchedAuthStatus = authStatuses.find((item) => item.platform === watchedPlatform);

  async function loadAuthStatuses(): Promise<void> {
    setAuthLoading(true);
    try {
      setAuthStatuses(await platformAuthApi.status());
    } catch {
      setAuthStatuses([]);
    } finally {
      setAuthLoading(false);
    }
  }

  async function loadAccounts(showLoading = true): Promise<void> {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      setAccounts(await accountApi.list());
    } catch (loadError) {
      setError(getErrorMessage(loadError, '账号列表加载失败'));
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function loadInitialAccounts(): Promise<void> {
      setLoading(true);
      try {
        const items = await accountApi.list();
        if (active) setAccounts(items);
      } catch (loadError) {
        if (active) setError(getErrorMessage(loadError, '账号列表加载失败'));
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadInitialAccounts();
    void loadAuthStatuses();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const connected = searchParams.get('connected');
    const connectError = searchParams.get('connectError');
    if (!connected && !connectError) return;
    if (connectError) {
      messageApi.error(connectError);
    } else {
      messageApi.success('授权成功，账号已加入列表');
    }
    setSearchParams({}, { replace: true });
    void loadAccounts(false);
    void loadAuthStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handleCreate(values: AccountInput): Promise<void> {
    setSaving(true);
    try {
      const account = await accountApi.create(values);
      setAccounts((current) => [account, ...current]);
      form.resetFields();
      setModalOpen(false);
      messageApi.success('账号已添加');
    } catch (createError) {
      messageApi.error(getErrorMessage(createError, '账号添加失败'));
    } finally {
      setSaving(false);
    }
  }

  async function handleConnectWechat(): Promise<void> {
    const values = await form.validateFields(['appId', 'appSecret']);
    setWechatConnecting(true);
    try {
      const account = await platformAuthApi.connectWechat({ appId: values.appId, appSecret: values.appSecret });
      setAccounts((current) => [account, ...current.filter((item) => item.id !== account.id)]);
      form.resetFields();
      setModalOpen(false);
      messageApi.success('微信公众号绑定成功，发布将走真实接口');
    } catch (connectError) {
      messageApi.error(getErrorMessage(connectError, '微信公众号绑定失败'));
    } finally {
      setWechatConnecting(false);
    }
  }

  function handleAuthorize(platform: PlatformAccount['platform']): void {
    // 直接在当前浏览器跳转平台授权页；完成后平台会回调服务器并重定向回本页。
    window.location.href = `/api/platform-auth/${platform}/authorize`;
  }

  async function handleDelete(id: number): Promise<void> {
    try {
      await accountApi.remove(id);
      setAccounts((current) => current.filter((account) => account.id !== id));
      messageApi.success('账号已删除');
    } catch (deleteError) {
      messageApi.error(getErrorMessage(deleteError, '账号删除失败'));
    }
  }

  const columns: TableProps<PlatformAccount>['columns'] = [
    {
      title: '平台',
      dataIndex: 'platform',
      width: 160,
      render: (platform: PlatformAccount['platform']) => <PlatformTag platform={platform} />,
    },
    { title: '账号名称', dataIndex: 'accountName', ellipsis: true },
    { title: '凭证', dataIndex: 'credentialMasked', width: 160, render: (value: string) => <code>{value}</code> },
    {
      title: '接入方式',
      dataIndex: 'connectionMode',
      width: 170,
      render: (mode: PlatformAccount['connectionMode']) => {
        const meta = CONNECTION_MODE_LABELS[mode] ?? CONNECTION_MODE_LABELS.manual;
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: PlatformAccount['status']) => (
        <Tag color={status === 'active' ? 'success' : 'error'}>{status === 'active' ? '正常' : '已过期'}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 86,
      fixed: 'right',
      render: (_, account) => (
        <Popconfirm title="删除该账号？" description="相关发布记录和统计也会被删除。" onConfirm={() => void handleDelete(account.id)}>
          <Tooltip title="删除账号"><Button danger type="text" icon={<DeleteOutlined />} aria-label={`删除${account.accountName}`} /></Tooltip>
        </Popconfirm>
      ),
    },
  ];

  const officialOAuthMode = watchedAccessMode === 'official' && watchedPlatform !== 'wechat';

  function renderAccessFields(): ReactNode {
    if (watchedAccessMode === 'manual') {
      return (
        <>
          <Form.Item
            name="accountName"
            label="账号名称"
            rules={[{ required: true, message: '请输入账号名称' }, { max: 120 }]}
          >
            <Input placeholder="例如：品牌官方账号" />
          </Form.Item>
          <Form.Item
            name="credential"
            label={<>Cookie / Token<FieldTip title={TIPS.manualCredential} /></>}
            rules={[{ required: true, message: '请输入模拟凭证' }]}
          >
            <Input.TextArea rows={3} placeholder="仅用于本地模拟发布" />
          </Form.Item>
        </>
      );
    }

    if (watchedPlatform === 'wechat') {
      return (
        <>
          <Form.Item
            name="appId"
            label={<>公众号 AppID<FieldTip title={TIPS.wechatAppId} /></>}
            rules={[{ required: true, message: '请输入 AppID' }]}
          >
            <Input placeholder="wx 开头的 AppID" autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="appSecret"
            label={<>AppSecret<FieldTip title={TIPS.wechatAppSecret} /></>}
            rules={[{ required: true, message: '请输入 AppSecret' }]}
          >
            <Input.Password placeholder="公众平台「基本配置」中生成" autoComplete="new-password" />
          </Form.Item>
          <Alert type="info" showIcon message="绑定即登录" description={TIPS.wechatPublish} style={{ marginBottom: 8 }} />
        </>
      );
    }

    const prerequisite = OAUTH_PREREQUISITES[watchedPlatform];
    const configured = watchedAuthStatus?.configured ?? false;
    return (
      <>
        <Alert
          type={configured ? 'info' : 'warning'}
          showIcon
          message={configured ? '跳转平台授权页登录' : '服务端还未配置该平台的应用凭据'}
          description={prerequisite}
          style={{ marginBottom: 12 }}
        />
        <Button
          type="primary"
          icon={<LinkOutlined />}
          disabled={!configured}
          onClick={() => handleAuthorize(watchedPlatform)}
        >
          前往{watchedPlatform === 'douyin' ? '抖音' : '小红书'}授权登录
        </Button>
        <Typography.Paragraph type="secondary" style={{ marginTop: 10, marginBottom: 0, fontSize: 12 }}>
          点击后将在当前浏览器打开平台官方授权页，登录并确认后自动跳回本页，账号会加入列表。
        </Typography.Paragraph>
      </>
    );
  }

  return (
    <div className="page">
      {contextHolder}
      <PageHeader
        title="平台账号"
        subtitle="统一维护微信公众号、抖音和小红书账号"
        extra={[
          <Tooltip title="刷新" key="refresh"><Button icon={<ReloadOutlined />} onClick={() => void loadAccounts()} aria-label="刷新账号" /></Tooltip>,
          <Button type="primary" icon={<PlusOutlined />} key="add" onClick={() => setModalOpen(true)}>添加账号</Button>,
        ]}
      />
      {error ? <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => void loadAccounts()}>重试</Button>} /> : null}
      <Card size="small" title="平台授权登录" style={{ marginTop: 16 }} styles={{ body: { paddingTop: 12, paddingBottom: 12 } }}>
        {authLoading ? (
          <div style={{ padding: '8px 0' }}><Spin size="small" /></div>
        ) : (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {authStatuses.map((item) => (
              <div key={item.platform} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <Space size={10}>
                  <PlatformTag platform={item.platform} />
                  <span style={{ color: '#8a918c', fontSize: 12 }}>
                    {item.platform === 'wechat'
                      ? '在下方「添加账号」中填写 AppID / AppSecret 完成绑定'
                      : item.configured ? '服务端凭据已配置，可直接授权登录' : '需先在 server/.env 配置平台应用凭据'}
                  </span>
                </Space>
                {item.platform !== 'wechat' ? (
                  <Button
                    size="small"
                    type={item.configured ? 'primary' : 'default'}
                    disabled={!item.configured}
                    icon={<LinkOutlined />}
                    onClick={() => handleAuthorize(item.platform)}
                  >
                    去授权
                  </Button>
                ) : (
                  <Button
                    size="small"
                    icon={<LinkOutlined />}
                    onClick={() => { setModalOpen(true); }}
                  >
                    绑定公众号
                  </Button>
                )}
              </div>
            ))}
          </Space>
        )}
      </Card>
      <div className="table-section">
        <Table<PlatformAccount>
          rowKey="id"
          columns={columns}
          dataSource={accounts}
          loading={loading}
          scroll={{ x: 860 }}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty description="还没有绑定平台账号" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </div>

      <Modal
        title="添加平台账号"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => {
          if (officialOAuthMode) return;
          if (watchedAccessMode === 'official') { void handleConnectWechat(); return; }
          form.submit();
        }}
        okText={watchedAccessMode === 'official' ? '验证并绑定' : '添加'}
        confirmLoading={watchedAccessMode === 'official' ? wechatConnecting : saving}
        destroyOnClose
        footer={officialOAuthMode ? null : undefined}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ platform: 'wechat', accessMode: 'official', status: 'active' }}
          onFinish={(values) => void handleCreate(values as AccountInput)}
        >
          <Form.Item name="platform" label="平台" rules={[{ required: true }]}>
            <Select options={PLATFORM_OPTIONS} />
          </Form.Item>
          <Form.Item name="accessMode" label={<>接入方式<FieldTip title={TIPS.accessMode} /></>}>
            <Radio.Group
              options={[
                { value: 'official', label: '官方授权登录（真实发布）' },
                { value: 'manual', label: '手动录入（模拟发布）' },
              ]}
            />
          </Form.Item>
          {renderAccessFields()}
          {watchedAccessMode === 'manual' ? (
            <Form.Item name="status" label="状态" rules={[{ required: true }]}>
              <Select options={[{ value: 'active', label: '正常' }, { value: 'expired', label: '已过期' }]} />
            </Form.Item>
          ) : null}
        </Form>
      </Modal>
    </div>
  );
}
