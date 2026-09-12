import { sequelize } from '../config/database.js';
import { User } from './User.js';
import { PlatformAccount } from './PlatformAccount.js';
import { Content } from './Content.js';
import { ContentTarget } from './ContentTarget.js';
import { PublishRecord } from './PublishRecord.js';
import { ContentStats } from './ContentStats.js';

User.initModel(sequelize);
PlatformAccount.initModel(sequelize);
Content.initModel(sequelize);
ContentTarget.initModel(sequelize);
PublishRecord.initModel(sequelize);
ContentStats.initModel(sequelize);

User.hasMany(PlatformAccount, { foreignKey: 'userId', as: 'platformAccounts', onDelete: 'CASCADE' });
PlatformAccount.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Content, { foreignKey: 'userId', as: 'contents', onDelete: 'CASCADE' });
Content.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Content.belongsToMany(PlatformAccount, {
  through: ContentTarget,
  foreignKey: 'contentId',
  otherKey: 'platformAccountId',
  as: 'targetAccounts',
});
PlatformAccount.belongsToMany(Content, {
  through: ContentTarget,
  foreignKey: 'platformAccountId',
  otherKey: 'contentId',
  as: 'contents',
});

Content.hasMany(PublishRecord, { foreignKey: 'contentId', as: 'publishRecords', onDelete: 'CASCADE' });
PublishRecord.belongsTo(Content, { foreignKey: 'contentId', as: 'content' });
PlatformAccount.hasMany(PublishRecord, { foreignKey: 'platformAccountId', as: 'publishRecords', onDelete: 'CASCADE' });
PublishRecord.belongsTo(PlatformAccount, { foreignKey: 'platformAccountId', as: 'platformAccount' });

Content.hasMany(ContentStats, { foreignKey: 'contentId', as: 'stats', onDelete: 'CASCADE' });
ContentStats.belongsTo(Content, { foreignKey: 'contentId', as: 'content' });
PlatformAccount.hasMany(ContentStats, { foreignKey: 'platformAccountId', as: 'stats', onDelete: 'CASCADE' });
ContentStats.belongsTo(PlatformAccount, { foreignKey: 'platformAccountId', as: 'platformAccount' });

export { sequelize, User, PlatformAccount, Content, ContentTarget, PublishRecord, ContentStats };
