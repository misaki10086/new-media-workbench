import { BookOutlined, VideoCameraOutlined, WechatOutlined } from '@ant-design/icons';
import { Tag } from 'antd';
import type { ReactNode } from 'react';
import type { Platform } from '../types';
import { platformMeta } from '../types';

const icons: Record<Platform, ReactNode> = {
  wechat: <WechatOutlined />,
  douyin: <VideoCameraOutlined />,
  xiaohongshu: <BookOutlined />,
};

export function PlatformTag({ platform }: { platform: Platform }) {
  const meta = platformMeta[platform];
  return <Tag icon={icons[platform]} color={meta.color}>{meta.label}</Tag>;
}
