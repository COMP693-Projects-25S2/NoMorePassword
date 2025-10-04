// Page Content Extractor for C-Client
// Extracts detailed content information from web pages for user_activities tracking

class PageContentExtractor {
    /**
     * 提取NSN页面内容信息
     */
    static async extractNSNContent(webContents, url) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;

            // 基础页面信息
            const baseInfo = {
                url: url,
                timestamp: Date.now(),
                pageType: this.detectPageType(pathname),
                domain: urlObj.hostname,
                pathname: pathname
            };

            // 根据页面类型提取特定信息
            let pageSpecificInfo = {};
            switch (baseInfo.pageType) {
                case 'journey':
                    pageSpecificInfo = await this.extractJourneyContent(webContents);
                    break;
                case 'event':
                    pageSpecificInfo = await this.extractEventContent(webContents);
                    break;
                case 'profile':
                    pageSpecificInfo = await this.extractProfileContent(webContents);
                    break;
                case 'home':
                    pageSpecificInfo = await this.extractHomeContent(webContents);
                    break;
                case 'search':
                    pageSpecificInfo = await this.extractSearchContent(webContents);
                    break;
                case 'login':
                    pageSpecificInfo = await this.extractLoginContent(webContents);
                    break;
                default:
                    pageSpecificInfo = await this.extractGeneralContent(webContents);
            }

            return { ...baseInfo, ...pageSpecificInfo };
        } catch (error) {
            console.error('Error extracting page content:', error);
            return {
                error: error.message,
                url: url,
                timestamp: Date.now(),
                pageType: 'error'
            };
        }
    }

    /**
     * 检测页面类型
     */
    static detectPageType(pathname) {
        if (pathname.includes('/journey/')) return 'journey';
        if (pathname.includes('/event/')) return 'event';
        if (pathname.includes('/profile/') || pathname.includes('/user/')) return 'profile';
        if (pathname === '/' || pathname.includes('/home')) return 'home';
        if (pathname.includes('/search')) return 'search';
        if (pathname.includes('/login')) return 'login';
        return 'other';
    }

    /**
     * 提取Journey页面信息
     */
    static async extractJourneyContent(webContents) {
        try {
            return await webContents.executeJavaScript(`
                (() => {
                    const data = {};
                    
                    // 基础内容
                    data.title = document.querySelector('h1, .journey-title, .card-title')?.textContent.trim() || '';
                    data.description = document.querySelector('.journey-description, .card-text, p')?.textContent.trim() || '';
                    
                    // 地理位置
                    data.location = document.querySelector('.location, .address, .journey-location')?.textContent.trim() || '';
                    
                    // 时间信息
                    data.date = document.querySelector('.date, .journey-date, .start-date')?.textContent.trim() || '';
                    
                    // 作者信息
                    data.author = document.querySelector('.username, .journey-author, .author')?.textContent.trim() || '';
                    
                    // 互动数据
                    data.likeCount = parseInt(document.querySelector('.like-count, .likes')?.textContent.trim() || '0');
                    data.commentCount = parseInt(document.querySelector('.comment-count, .comments')?.textContent.trim() || '0');
                    
                    // 图片信息
                    const coverImg = document.querySelector('.cover-image, .journey-cover, img');
                    data.coverImage = coverImg ? coverImg.src : '';
                    data.imageCount = document.querySelectorAll('img').length;
                    
                    // 页面状态
                    data.isPublic = document.querySelector('.public, .published') !== null;
                    data.isPrivate = document.querySelector('.private') !== null;
                    
                    // 事件数量
                    data.eventCount = document.querySelectorAll('.event-item, .event-card').length;
                    
                    // 提取journey ID（从URL或页面元素）
                    const journeyIdMatch = window.location.pathname.match(/\\/journey\\/(?:view\\/)?(\\d+)/);
                    data.journeyId = journeyIdMatch ? journeyIdMatch[1] : null;
                    
                    return data;
                })()
            `);
        } catch (error) {
            console.error('Error extracting journey content:', error);
            return { error: error.message };
        }
    }

    /**
     * 提取Event页面信息
     */
    static async extractEventContent(webContents) {
        try {
            return await webContents.executeJavaScript(`
                (() => {
                    const data = {};
                    
                    data.title = document.querySelector('.event-title, h2, .card-title')?.textContent.trim() || '';
                    data.description = document.querySelector('.event-description, .card-text')?.textContent.trim() || '';
                    
                    // 时间和地点
                    data.startTime = document.querySelector('.start-time, .event-start')?.textContent.trim() || '';
                    data.endTime = document.querySelector('.end-time, .event-end')?.textContent.trim() || '';
                    data.location = document.querySelector('.event-location, .location')?.textContent.trim() || '';
                    
                    // 互动数据
                    data.likeCount = parseInt(document.querySelector('.like-count')?.textContent.trim() || '0');
                    data.commentCount = parseInt(document.querySelector('.comment-count')?.textContent.trim() || '0');
                    
                    // 图片信息
                    const eventImages = document.querySelectorAll('.event-image, .event-images img');
                    data.images = Array.from(eventImages).map(img => img.src);
                    data.imageCount = eventImages.length;
                    
                    // 关联的journey
                    data.journeyTitle = document.querySelector('.journey-title, .related-journey')?.textContent.trim() || '';
                    
                    // 提取event ID
                    const eventIdMatch = window.location.pathname.match(/\\/event\\/(?:view\\/)?(\\d+)/);
                    data.eventId = eventIdMatch ? eventIdMatch[1] : null;
                    
                    return data;
                })()
            `);
        } catch (error) {
            console.error('Error extracting event content:', error);
            return { error: error.message };
        }
    }

    /**
     * 提取Profile页面信息
     */
    static async extractProfileContent(webContents) {
        try {
            return await webContents.executeJavaScript(`
                (() => {
                    const data = {};
                    
                    data.username = document.querySelector('.username, .profile-username')?.textContent.trim() || '';
                    data.fullName = document.querySelector('.full-name, .profile-name')?.textContent.trim() || '';
                    data.bio = document.querySelector('.bio, .profile-bio, .description')?.textContent.trim() || '';
                    data.location = document.querySelector('.user-location, .profile-location')?.textContent.trim() || '';
                    
                    // 统计数据
                    data.journeyCount = parseInt(document.querySelector('.journey-count')?.textContent.trim() || '0');
                    data.eventCount = parseInt(document.querySelector('.event-count')?.textContent.trim() || '0');
                    data.followerCount = parseInt(document.querySelector('.follower-count')?.textContent.trim() || '0');
                    
                    // 头像
                    const avatar = document.querySelector('.avatar, .profile-image, .user-image');
                    data.avatar = avatar ? avatar.src : '';
                    
                    // 是否公开
                    data.isPublic = document.querySelector('.public-profile') !== null;
                    
                    return data;
                })()
            `);
        } catch (error) {
            console.error('Error extracting profile content:', error);
            return { error: error.message };
        }
    }

    /**
     * 提取首页信息
     */
    static async extractHomeContent(webContents) {
        try {
            return await webContents.executeJavaScript(`
                (() => {
                    const data = {};
                    
                    // 页面内容统计
                    data.journeyCount = document.querySelectorAll('.journey-card, .journey-item').length;
                    data.eventCount = document.querySelectorAll('.event-card, .event-item').length;
                    data.userCount = document.querySelectorAll('.user-card, .profile-card').length;
                    
                    // 搜索信息
                    const searchInput = document.querySelector('input[type="search"], input[name="keyword"]');
                    data.hasSearch = searchInput !== null;
                    
                    // 分类信息
                    const categories = document.querySelectorAll('.category, .filter-tag');
                    data.categories = Array.from(categories).map(cat => cat.textContent.trim());
                    
                    // 热门内容
                    data.trendingJourneys = document.querySelectorAll('.trending .journey-title').length;
                    
                    // 公告信息
                    const announcements = document.querySelectorAll('.announcement, .notice');
                    data.announcementCount = announcements.length;
                    
                    return data;
                })()
            `);
        } catch (error) {
            console.error('Error extracting home content:', error);
            return { error: error.message };
        }
    }

    /**
     * 提取搜索页面信息
     */
    static async extractSearchContent(webContents) {
        try {
            return await webContents.executeJavaScript(`
                (() => {
                    const data = {};
                    
                    // 搜索关键词
                    const searchInput = document.querySelector('input[type="search"], input[name="keyword"]');
                    data.searchKeyword = searchInput ? searchInput.value : '';
                    
                    // 搜索结果统计
                    data.resultCount = document.querySelectorAll('.search-result, .result-item').length;
                    data.journeyResults = document.querySelectorAll('.search-result.journey, .journey-item').length;
                    data.eventResults = document.querySelectorAll('.search-result.event, .event-item').length;
                    data.userResults = document.querySelectorAll('.search-result.user, .user-item').length;
                    
                    // 筛选器
                    const filters = document.querySelectorAll('.filter, .filter-option');
                    data.activeFilters = Array.from(filters).map(filter => filter.textContent.trim());
                    
                    return data;
                })()
            `);
        } catch (error) {
            console.error('Error extracting search content:', error);
            return { error: error.message };
        }
    }

    /**
     * 提取登录页面信息
     */
    static async extractLoginContent(webContents) {
        try {
            return await webContents.executeJavaScript(`
                (() => {
                    const data = {};
                    
                    // 登录表单信息
                    data.hasLoginForm = document.querySelector('form[action*="login"], .login-form') !== null;
                    data.hasSignupForm = document.querySelector('form[action*="signup"], .signup-form') !== null;
                    data.hasForgotPassword = document.querySelector('.forgot-password, a[href*="forgot"]') !== null;
                    
                    // 社交媒体登录
                    data.hasSocialLogin = document.querySelector('.social-login, .oauth-login') !== null;
                    
                    return data;
                })()
            `);
        } catch (error) {
            console.error('Error extracting login content:', error);
            return { error: error.message };
        }
    }

    /**
     * 提取通用页面信息
     */
    static async extractGeneralContent(webContents) {
        try {
            return await webContents.executeJavaScript(`
                (() => {
                    const data = {};
                    
                    // 页面元数据
                    const metaDesc = document.querySelector('meta[name="description"]');
                    data.metaDescription = metaDesc ? metaDesc.content : '';
                    
                    // 页面结构
                    data.headingCount = {
                        h1: document.querySelectorAll('h1').length,
                        h2: document.querySelectorAll('h2').length,
                        h3: document.querySelectorAll('h3').length
                    };
                    
                    data.imageCount = document.querySelectorAll('img').length;
                    data.linkCount = document.querySelectorAll('a').length;
                    
                    // 主要内容
                    const mainContent = document.querySelector('main, .main-content, .content');
                    data.hasMainContent = mainContent !== null;
                    
                    // 表单信息
                    data.formCount = document.querySelectorAll('form').length;
                    
                    return data;
                })()
            `);
        } catch (error) {
            console.error('Error extracting general content:', error);
            return { error: error.message };
        }
    }
}

module.exports = PageContentExtractor;
