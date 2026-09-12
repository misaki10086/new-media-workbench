import { Space, Typography, type SpaceProps } from 'antd';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  extra?: ReactNode;
}

export function PageHeader({ title, subtitle, extra }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <Typography.Title level={2}>{title}</Typography.Title>
        {subtitle ? <Typography.Text type="secondary">{subtitle}</Typography.Text> : null}
      </div>
      {extra ? <Space wrap align="center" size={8} className="page-actions">{extra}</Space> : null}
    </div>
  );
}

export const compactSpaceProps: SpaceProps = { size: 6, wrap: true };
