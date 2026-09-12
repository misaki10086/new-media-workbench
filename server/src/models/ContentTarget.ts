import { DataTypes, Model, type InferAttributes, type InferCreationAttributes, type ForeignKey, type Sequelize } from 'sequelize';
import type { Content } from './Content.js';
import type { PlatformAccount } from './PlatformAccount.js';

export class ContentTarget extends Model<InferAttributes<ContentTarget>, InferCreationAttributes<ContentTarget>> {
  declare contentId: ForeignKey<Content['id']>;
  declare platformAccountId: ForeignKey<PlatformAccount['id']>;

  static initModel(sequelize: Sequelize): typeof ContentTarget {
    ContentTarget.init(
      {
        contentId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, primaryKey: true },
        platformAccountId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, primaryKey: true },
      },
      { sequelize, tableName: 'ContentTargets', modelName: 'ContentTarget', timestamps: false },
    );
    return ContentTarget;
  }
}
