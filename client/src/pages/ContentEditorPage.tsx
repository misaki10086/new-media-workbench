import {
  ArrowLeftOutlined,
  BulbOutlined,
  LinkOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Form,
  Image,
  Input,
  List,
  Modal,
  Segmented,
  Select,
  Skeleton,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { accountApi, aiApi, contentApi, getErrorMessage } from '../api';
import { PageHeader } from '../components/PageHeader';
import type { ContentInput, PlatformAccount } from '../types';
import { platformMeta } from '../types';

interface EditorValues {
  title: string;
  body: string;
  coverUrl?: string;
  tags: string[];
  accountIds: number[];
  publishMode: 'now' | 'scheduled';
  scheduledAt?: Dayjs;
}

export function ContentEditorPage() {
  const { id } = useParams();
  const editId = id ? Number(id) : null;
  const navigate = useNavigate();
  const [form] = Form.useForm<EditorValues>();
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [loading, setLoading] = useState(Boolean(editId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [titles, setTitles] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const publishMode = Form.useWatch('publishMode', form) ?? 'now';
  const coverUrl = Form.useWatch('coverUrl', form);

  useEffect(() => {
    let active = true;
    async function loadEditor(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const [accountItems, contents] = await Promise.all([
          accountApi.list(),
          editId ? contentApi.list() : Promise.resolve([]),
        ]);
        if (!active) return;
        setAccounts(accountItems);
        if (editId) {
          const content = contents.find((item) => item.id === editId);
          if (!content) throw new Error('内容不存在或已被删除');
          form.setFieldsValue({
            title: content.title,
            body: content.body,
            coverUrl: content.coverUrl ?? undefined,
            tags: content.tags,
            accountIds: content.targetAccountIds,
            publishMode: content.scheduledAt ? 'scheduled' : 'now',
            scheduledAt: content.scheduledAt ? dayjs(content.scheduledAt) : undefined,
          });
        }
      } catch (loadError) {
        if (active) setError(getErrorMessage(loadError, '编辑器加载失败'));
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadEditor();
    return () => { active = false; };
  }, [editId, form]);

  async function handleSave(values: EditorValues): Promise<void> {
    const input: ContentInput = {
      title: values.title,
      body: values.body,
      coverUrl: values.coverUrl?.trim() || null,
      tags: values.tags ?? [],
      accountIds: values.accountIds ?? [],
      scheduledAt: values.publishMode === 'scheduled' && values.scheduledAt
        ? values.scheduledAt.toISOString()
        : null,
      contentType: 'article',
      videoUrl: null,
    };
    setSaving(true);
    try {
      if (editId) await contentApi.update(editId, input);
      else await contentApi.create(input);
      messageApi.success(editId ? '内容已更新' : '草稿已创建');
      navigate('/contents');
    } catch (saveError) {
      messageApi.error(getErrorMessage(saveError, '内容保存失败'));
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate(): Promise<void> {
    if (topic.trim().length < 2) {
      messageApi.warning('请输入至少 2 个字的主题关键词');
      return;
    }
    setGenerating(true);
    setTitles([]);
    try {
      setTitles(await aiApi.generateTitles(topic.trim()));
    } catch (generateError) {
      messageApi.error(getErrorMessage(generateError, 'AI 标题生成失败'));
    } finally {
      setGenerating(false);
    }
  }

  function chooseTitle(title: string): void {
    form.setFieldValue('title', title);
    setAiOpen(false);
    messageApi.success('标题已填入');
  }

  if (loading) {
    return <div className="page"><Skeleton active paragraph={{ rows: 10 }} /></div>;
  }

  return (
    <div className="page editor-page">
      {contextHolder}
      <PageHeader
        title={editId ? '编辑内容' : '新建内容'}
        subtitle="图文内容"
        extra={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/contents')}>返回列表</Button>}
      />
      {error ? (
        <Alert
          type="error"
          showIcon
          message={error}
          action={<Button size="small" onClick={() => navigate('/contents')}>返回</Button>}
        />
      ) : (
        <Form<EditorValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={{ tags: [], accountIds: [], publishMode: 'now' }}
          onFinish={(values) => void handleSave(values)}
        >
          <div className="editor-grid">
            <div className="editor-main">
              <div className="field-title-row">
                <Typography.Title level={3}>内容信息</Typography.Title>
                <Button icon={<BulbOutlined />} onClick={() => setAiOpen(true)}>AI 生成标题</Button>
              </div>
              <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }, { max: 255 }]}>
                <Input size="large" placeholder="输入内容标题" showCount maxLength={255} />
              </Form.Item>
              <Form.Item name="body" label="正文" rules={[{ required: true, message: '请输入正文' }]}>
                <Input.TextArea rows={15} placeholder="输入图文正文" showCount maxLength={1_000_000} />
              </Form.Item>
              <Form.Item name="coverUrl" label="封面图 URL" rules={[{ type: 'url', warningOnly: true, message: '请输入完整 URL' }]}>
                <Input prefix={<LinkOutlined />} placeholder="https://example.com/cover.jpg" />
              </Form.Item>
              <Form.Item name="tags" label="标签">
                <Select mode="tags" tokenSeparators={[',', '，']} maxCount={30} placeholder="输入标签后回车" />
              </Form.Item>
            </div>

            <aside className="editor-aside">
              <Typography.Title level={3}>发布设置</Typography.Title>
              <Form.Item name="accountIds" label="目标账号" extra="可先保存草稿，发布前再选择账号">
                <Select
                  mode="multiple"
                  placeholder="选择发布账号"
                  optionFilterProp="label"
                  options={accounts.map((account) => ({
                    value: account.id,
                    label: `${platformMeta[account.platform].label} · ${account.accountName}`,
                    disabled: account.status === 'expired',
                  }))}
                  notFoundContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请先添加平台账号" />}
                />
              </Form.Item>
              <Form.Item name="publishMode" label="发布时间">
                <Segmented block options={[{ label: '立即', value: 'now' }, { label: '定时', value: 'scheduled' }]} />
              </Form.Item>
              {publishMode === 'scheduled' ? (
                <Form.Item
                  name="scheduledAt"
                  label="定时时间"
                  rules={[{ required: true, message: '请选择定时时间' }]}
                >
                  <DatePicker
                    showTime
                    format="YYYY-MM-DD HH:mm"
                    style={{ width: '100%' }}
                    disabledDate={(date) => date.endOf('day').isBefore(dayjs())}
                  />
                </Form.Item>
              ) : null}

              <div className="cover-preview">
                <Typography.Text type="secondary">封面预览</Typography.Text>
                {coverUrl ? (
                  <Image src={coverUrl} alt="内容封面预览" fallback="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" />
                ) : (
                  <div className="cover-placeholder"><LinkOutlined /><span>暂无封面</span></div>
                )}
              </div>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving} block size="large">
                {editId ? '保存修改' : '保存草稿'}
              </Button>
            </aside>
          </div>
        </Form>
      )}

      <Modal
        title="AI 生成标题"
        open={aiOpen}
        onCancel={() => setAiOpen(false)}
        footer={null}
        destroyOnClose={false}
      >
        <Space.Compact style={{ width: '100%' }}>
          <Input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            onPressEnter={() => void handleGenerate()}
            placeholder="输入主题关键词"
            maxLength={200}
          />
          <Button type="primary" loading={generating} onClick={() => void handleGenerate()}>生成</Button>
        </Space.Compact>
        <List
          className="title-suggestion-list"
          loading={generating}
          dataSource={titles}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无候选标题" /> }}
          renderItem={(title, index) => (
            <List.Item>
              <Button type="text" block className="title-suggestion" onClick={() => chooseTitle(title)}>
                <Tag>{index + 1}</Tag><span>{title}</span>
              </Button>
            </List.Item>
          )}
        />
      </Modal>
    </div>
  );
}
