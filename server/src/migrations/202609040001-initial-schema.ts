import { DataTypes, type QueryInterface } from 'sequelize';

export const initialSchema = {
  name: '202609040001-initial-schema',
  async up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
    await queryInterface.createTable('Users', {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true, allowNull: false },
      username: { type: DataTypes.STRING(80), allowNull: false, unique: true },
      password: { type: DataTypes.STRING(255), allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('PlatformAccounts', {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true, allowNull: false },
      platform: { type: DataTypes.ENUM('wechat', 'douyin', 'xiaohongshu'), allowNull: false },
      accountName: { type: DataTypes.STRING(120), allowNull: false },
      credential: { type: DataTypes.TEXT, allowNull: false },
      status: { type: DataTypes.ENUM('active', 'expired'), allowNull: false, defaultValue: 'active' },
      userId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex('PlatformAccounts', ['userId']);
    await queryInterface.addIndex('PlatformAccounts', ['userId', 'platform', 'accountName'], {
      unique: true,
      name: 'platform_accounts_user_platform_name_unique',
    });

    await queryInterface.createTable('Contents', {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true, allowNull: false },
      title: { type: DataTypes.STRING(255), allowNull: false },
      body: { type: DataTypes.TEXT('long'), allowNull: false },
      coverUrl: { type: DataTypes.STRING(2048), allowNull: true },
      tags: { type: DataTypes.JSON, allowNull: false },
      status: { type: DataTypes.ENUM('draft', 'published'), allowNull: false, defaultValue: 'draft' },
      scheduledAt: { type: DataTypes.DATE, allowNull: true },
      contentType: { type: DataTypes.ENUM('article', 'video'), allowNull: false, defaultValue: 'article' },
      videoUrl: { type: DataTypes.STRING(2048), allowNull: true },
      userId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex('Contents', ['userId']);
    await queryInterface.addIndex('Contents', ['status']);

    await queryInterface.createTable('ContentTargets', {
      contentId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        references: { model: 'Contents', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      platformAccountId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        references: { model: 'PlatformAccounts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
    });

    await queryInterface.createTable('PublishRecords', {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true, allowNull: false },
      contentId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'Contents', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      platformAccountId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'PlatformAccounts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      status: { type: DataTypes.ENUM('pending', 'success', 'failed'), allowNull: false, defaultValue: 'pending' },
      errorMessage: { type: DataTypes.TEXT, allowNull: true },
      publishedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex('PublishRecords', ['contentId']);
    await queryInterface.addIndex('PublishRecords', ['platformAccountId']);
    await queryInterface.addIndex('PublishRecords', ['status']);

    await queryInterface.createTable('ContentStats', {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true, allowNull: false },
      contentId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'Contents', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      platformAccountId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'PlatformAccounts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      views: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      likes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      comments: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      shares: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      recordedAt: { type: DataTypes.DATE, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex('ContentStats', ['contentId']);
    await queryInterface.addIndex('ContentStats', ['platformAccountId']);
  },

  async down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
    await queryInterface.dropTable('ContentStats');
    await queryInterface.dropTable('PublishRecords');
    await queryInterface.dropTable('ContentTargets');
    await queryInterface.dropTable('Contents');
    await queryInterface.dropTable('PlatformAccounts');
    await queryInterface.dropTable('Users');
  },
};
