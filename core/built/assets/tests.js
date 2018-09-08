'use strict';

define('ghost-admin/tests/acceptance/authentication-test', ['ghost-admin/authenticators/oauth2', 'npm:deparam', 'ghost-admin/tests/helpers/destroy-app', 'ghost-admin/tests/helpers/start-app', 'ghost-admin/utils/window-proxy', 'ember-cli-mirage', 'mocha', 'ghost-admin/tests/helpers/ember-simple-auth', 'chai'], function (_oauth, _npmDeparam, _destroyApp, _startApp, _windowProxy, _emberCliMirage, _mocha, _emberSimpleAuth, _chai) {
    'use strict';

    (0, _mocha.describe)('Acceptance: Authentication', function () {
        let application, originalReplaceLocation;

        (0, _mocha.beforeEach)(function () {
            application = (0, _startApp.default)();
        });

        (0, _mocha.afterEach)(function () {
            (0, _destroyApp.default)(application);
        });

        (0, _mocha.describe)('setup redirect', function () {
            (0, _mocha.beforeEach)(function () {
                // ensure the /users/me route doesn't error
                server.create('user');

                server.get('authentication/setup', function () {
                    return { setup: [{ status: false }] };
                });
            });

            (0, _mocha.it)('redirects to setup when setup isn\'t complete', async function () {
                await visit('settings/labs');

                (0, _chai.expect)(currentURL()).to.equal('/setup/one');
            });
        });

        (0, _mocha.describe)('token handling', function () {
            (0, _mocha.beforeEach)(function () {
                // replace the default test authenticator with our own authenticator
                application.register('authenticator:test', _oauth.default);

                let role = server.create('role', { name: 'Administrator' });
                server.create('user', { roles: [role], slug: 'test-user' });
            });

            (0, _mocha.it)('refreshes tokens on boot if last refreshed > 24hrs ago', async function () {
                /* eslint-disable camelcase */
                // the tokens here don't matter, we're using the actual oauth
                // authenticator so we get the tokens back from the mirage endpoint
                await (0, _emberSimpleAuth.authenticateSession)(application, {
                    access_token: 'access_token',
                    refresh_token: 'refresh_token'
                });

                // authenticating the session above will trigger a token refresh
                // request so we need to clear it to ensure we aren't testing the
                // test behaviour instead of application behaviour
                server.pretender.handledRequests = [];

                // fake a longer session so it appears that we last refreshed > 24hrs ago
                var _application = application;
                let container = _application.__container__;

                var _container$lookup = container.lookup('service:session');

                let session = _container$lookup.session;

                let newSession = session.get('content');
                newSession.authenticated.expires_in = 172800 * 2;
                session.get('store').persist(newSession);
                /* eslint-enable camelcase */

                await visit('/');

                let requests = server.pretender.handledRequests;
                let refreshRequest = requests.findBy('url', '/ghost/api/v0.1/authentication/token');

                (0, _chai.expect)(refreshRequest, 'token refresh request').to.exist;
                (0, _chai.expect)(refreshRequest.method, 'method').to.equal('POST');

                let requestBody = (0, _npmDeparam.default)(refreshRequest.requestBody);
                (0, _chai.expect)(requestBody.grant_type, 'grant_type').to.equal('refresh_token');
                (0, _chai.expect)(requestBody.refresh_token, 'refresh_token').to.equal('MirageRefreshToken');
            });

            (0, _mocha.it)('doesn\'t refresh tokens on boot if last refreshed < 24hrs ago', async function () {
                /* eslint-disable camelcase */
                // the tokens here don't matter, we're using the actual oauth
                // authenticator so we get the tokens back from the mirage endpoint
                await (0, _emberSimpleAuth.authenticateSession)(application, {
                    access_token: 'access_token',
                    refresh_token: 'refresh_token'
                });
                /* eslint-enable camelcase */

                // authenticating the session above will trigger a token refresh
                // request so we need to clear it to ensure we aren't testing the
                // test behaviour instead of application behaviour
                server.pretender.handledRequests = [];

                // we've only just refreshed tokens above so we should always be < 24hrs
                await visit('/');

                let requests = server.pretender.handledRequests;
                let refreshRequest = requests.findBy('url', '/ghost/api/v0.1/authentication/token');

                (0, _chai.expect)(refreshRequest, 'refresh request').to.not.exist;
            });
        });

        (0, _mocha.describe)('general page', function () {
            let newLocation;

            (0, _mocha.beforeEach)(function () {
                originalReplaceLocation = _windowProxy.default.replaceLocation;
                _windowProxy.default.replaceLocation = function (url) {
                    url = url.replace(/^\/ghost\//, '/');
                    newLocation = url;
                };
                newLocation = undefined;

                let role = server.create('role', { name: 'Administrator' });
                server.create('user', { roles: [role], slug: 'test-user' });
            });

            (0, _mocha.afterEach)(function () {
                _windowProxy.default.replaceLocation = originalReplaceLocation;
            });

            (0, _mocha.it)('invalidates session on 401 API response', async function () {
                // return a 401 when attempting to retrieve users
                server.get('/users/', () => new _emberCliMirage.Response(401, {}, {
                    errors: [{ message: 'Access denied.', errorType: 'UnauthorizedError' }]
                }));

                await (0, _emberSimpleAuth.authenticateSession)(application);
                await visit('/team');

                // running `visit(url)` inside windowProxy.replaceLocation breaks
                // the async behaviour so we need to run `visit` here to simulate
                // the browser visiting the new page
                if (newLocation) {
                    await visit(newLocation);
                }

                (0, _chai.expect)(currentURL(), 'url after 401').to.equal('/signin');
            });

            (0, _mocha.it)('doesn\'t show navigation menu on invalid url when not authenticated', async function () {
                (0, _emberSimpleAuth.invalidateSession)(application);

                await visit('/');

                (0, _chai.expect)(currentURL(), 'current url').to.equal('/signin');
                (0, _chai.expect)(find('nav.gh-nav').length, 'nav menu presence').to.equal(0);

                await visit('/signin/invalidurl/');

                (0, _chai.expect)(currentURL(), 'url after invalid url').to.equal('/signin/invalidurl/');
                (0, _chai.expect)(currentPath(), 'path after invalid url').to.equal('error404');
                (0, _chai.expect)(find('nav.gh-nav').length, 'nav menu presence').to.equal(0);
            });

            (0, _mocha.it)('shows nav menu on invalid url when authenticated', async function () {
                await (0, _emberSimpleAuth.authenticateSession)(application);
                await visit('/signin/invalidurl/');

                (0, _chai.expect)(currentURL(), 'url after invalid url').to.equal('/signin/invalidurl/');
                (0, _chai.expect)(currentPath(), 'path after invalid url').to.equal('error404');
                (0, _chai.expect)(find('nav.gh-nav').length, 'nav menu presence').to.equal(1);
            });
        });

        // TODO: re-enable once modal reappears correctly
        _mocha.describe.skip('editor', function () {
            let origDebounce = Ember.run.debounce;
            let origThrottle = Ember.run.throttle;

            // we don't want the autosave interfering in this test
            (0, _mocha.beforeEach)(function () {
                Ember.run.debounce = function () {};
                Ember.run.throttle = function () {};
            });

            (0, _mocha.it)('displays re-auth modal attempting to save with invalid session', async function () {
                let role = server.create('role', { name: 'Administrator' });
                server.create('user', { roles: [role] });

                // simulate an invalid session when saving the edited post
                server.put('/posts/:id/', function ({ posts }, { params }) {
                    let post = posts.find(params.id);
                    let attrs = this.normalizedRequestAttrs();

                    if (attrs.mobiledoc.cards[0][1].markdown === 'Edited post body') {
                        return new _emberCliMirage.Response(401, {}, {
                            errors: [{ message: 'Access denied.', errorType: 'UnauthorizedError' }]
                        });
                    } else {
                        return post.update(attrs);
                    }
                });

                await (0, _emberSimpleAuth.authenticateSession)(application);

                await visit('/editor');

                // create the post
                await fillIn('#entry-title', 'Test Post');
                await fillIn('.__mobiledoc-editor', 'Test post body');
                await click('.js-publish-button');

                // we shouldn't have a modal at this point
                (0, _chai.expect)(find('.modal-container #login').length, 'modal exists').to.equal(0);
                // we also shouldn't have any alerts
                (0, _chai.expect)(find('.gh-alert').length, 'no of alerts').to.equal(0);

                // update the post
                await fillIn('.__mobiledoc-editor', 'Edited post body');
                await click('.js-publish-button');

                // we should see a re-auth modal
                (0, _chai.expect)(find('.fullscreen-modal #login').length, 'modal exists').to.equal(1);
            });

            // don't clobber debounce/throttle for future tests
            (0, _mocha.afterEach)(function () {
                Ember.run.debounce = origDebounce;
                Ember.run.throttle = origThrottle;
            });
        });
    });
});
define('ghost-admin/tests/acceptance/content-test', ['ghost-admin/tests/helpers/destroy-app', 'ghost-admin/tests/helpers/start-app', 'mocha', 'ghost-admin/tests/helpers/ember-simple-auth', 'chai'], function (_destroyApp, _startApp, _mocha, _emberSimpleAuth, _chai) {
            'use strict';

            var _slicedToArray = function () {
                        function sliceIterator(arr, i) {
                                    var _arr = [];
                                    var _n = true;
                                    var _d = false;
                                    var _e = undefined;

                                    try {
                                                for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
                                                            _arr.push(_s.value);

                                                            if (i && _arr.length === i) break;
                                                }
                                    } catch (err) {
                                                _d = true;
                                                _e = err;
                                    } finally {
                                                try {
                                                            if (!_n && _i["return"]) _i["return"]();
                                                } finally {
                                                            if (_d) throw _e;
                                                }
                                    }

                                    return _arr;
                        }

                        return function (arr, i) {
                                    if (Array.isArray(arr)) {
                                                return arr;
                                    } else if (Symbol.iterator in Object(arr)) {
                                                return sliceIterator(arr, i);
                                    } else {
                                                throw new TypeError("Invalid attempt to destructure non-iterable instance");
                                    }
                        };
            }();

            (0, _mocha.describe)('Acceptance: Content', function () {
                        let application;

                        (0, _mocha.beforeEach)(function () {
                                    application = (0, _startApp.default)();
                        });

                        (0, _mocha.afterEach)(function () {
                                    (0, _destroyApp.default)(application);
                        });

                        (0, _mocha.it)('redirects to signin when not authenticated', async function () {
                                    (0, _emberSimpleAuth.invalidateSession)(application);
                                    await visit('/');

                                    (0, _chai.expect)(currentURL()).to.equal('/signin');
                        });

                        (0, _mocha.describe)('as admin', function () {
                                    let admin, editor, publishedPost, scheduledPost, draftPost, publishedPage, authorPost;

                                    (0, _mocha.beforeEach)(function () {
                                                let adminRole = server.create('role', { name: 'Administrator' });
                                                admin = server.create('user', { roles: [adminRole] });
                                                let editorRole = server.create('role', { name: 'Editor' });
                                                editor = server.create('user', { roles: [editorRole] });

                                                publishedPost = server.create('post', { authors: [admin], status: 'published', title: 'Published Post' });
                                                scheduledPost = server.create('post', { authors: [admin], status: 'scheduled', title: 'Scheduled Post' });
                                                draftPost = server.create('post', { authors: [admin], status: 'draft', title: 'Draft Post' });
                                                publishedPage = server.create('post', { authors: [admin], status: 'published', page: true, title: 'Published Page' });
                                                authorPost = server.create('post', { authors: [editor], status: 'published', title: 'Editor Published Post' });

                                                return (0, _emberSimpleAuth.authenticateSession)(application);
                                    });

                                    (0, _mocha.it)('displays and filters posts', async function () {
                                                await visit('/');
                                                // Not checking request here as it won't be the last request made
                                                // Displays all posts + pages
                                                (0, _chai.expect)(find('[data-test-post-id]').length, 'all posts count').to.equal(5);

                                                // show draft posts
                                                await selectChoose('[data-test-type-select]', 'Draft posts');

                                                // API request is correct

                                                var _server$pretender$han = server.pretender.handledRequests.slice(-1),
                                                    _server$pretender$han2 = _slicedToArray(_server$pretender$han, 1);

                                                let lastRequest = _server$pretender$han2[0];

                                                (0, _chai.expect)(lastRequest.queryParams.filter, '"drafts" request status filter').to.have.string('status:draft');
                                                (0, _chai.expect)(lastRequest.queryParams.filter, '"drafts" request page filter').to.have.string('page:false');
                                                // Displays draft post
                                                (0, _chai.expect)(find('[data-test-post-id]').length, 'drafts count').to.equal(1);
                                                (0, _chai.expect)(find(`[data-test-post-id="${draftPost.id}"]`), 'draft post').to.exist;

                                                // show published posts
                                                await selectChoose('[data-test-type-select]', 'Published posts');

                                                // API request is correct

                                                var _server$pretender$han3 = server.pretender.handledRequests.slice(-1);

                                                var _server$pretender$han4 = _slicedToArray(_server$pretender$han3, 1);

                                                lastRequest = _server$pretender$han4[0];

                                                (0, _chai.expect)(lastRequest.queryParams.filter, '"published" request status filter').to.have.string('status:published');
                                                (0, _chai.expect)(lastRequest.queryParams.filter, '"published" request page filter').to.have.string('page:false');
                                                // Displays three published posts + pages
                                                (0, _chai.expect)(find('[data-test-post-id]').length, 'published count').to.equal(2);
                                                (0, _chai.expect)(find(`[data-test-post-id="${publishedPost.id}"]`), 'admin published post').to.exist;
                                                (0, _chai.expect)(find(`[data-test-post-id="${authorPost.id}"]`), 'author published post').to.exist;

                                                // show scheduled posts
                                                await selectChoose('[data-test-type-select]', 'Scheduled posts');

                                                // API request is correct

                                                var _server$pretender$han5 = server.pretender.handledRequests.slice(-1);

                                                var _server$pretender$han6 = _slicedToArray(_server$pretender$han5, 1);

                                                lastRequest = _server$pretender$han6[0];

                                                (0, _chai.expect)(lastRequest.queryParams.filter, '"scheduled" request status filter').to.have.string('status:scheduled');
                                                (0, _chai.expect)(lastRequest.queryParams.filter, '"scheduled" request page filter').to.have.string('page:false');
                                                // Displays scheduled post
                                                (0, _chai.expect)(find('[data-test-post-id]').length, 'scheduled count').to.equal(1);
                                                (0, _chai.expect)(find(`[data-test-post-id="${scheduledPost.id}"]`), 'scheduled post').to.exist;

                                                // show pages
                                                await selectChoose('[data-test-type-select]', 'Pages');

                                                // API request is correct

                                                var _server$pretender$han7 = server.pretender.handledRequests.slice(-1);

                                                var _server$pretender$han8 = _slicedToArray(_server$pretender$han7, 1);

                                                lastRequest = _server$pretender$han8[0];

                                                (0, _chai.expect)(lastRequest.queryParams.filter, '"pages" request status filter').to.have.string('status:[draft,scheduled,published]');
                                                (0, _chai.expect)(lastRequest.queryParams.filter, '"pages" request page filter').to.have.string('page:true');
                                                // Displays page
                                                (0, _chai.expect)(find('[data-test-post-id]').length, 'pages count').to.equal(1);
                                                (0, _chai.expect)(find(`[data-test-post-id="${publishedPage.id}"]`), 'page post').to.exist;

                                                // show all posts
                                                await selectChoose('[data-test-type-select]', 'All posts');

                                                // API request is correct

                                                var _server$pretender$han9 = server.pretender.handledRequests.slice(-1);

                                                var _server$pretender$han10 = _slicedToArray(_server$pretender$han9, 1);

                                                lastRequest = _server$pretender$han10[0];

                                                (0, _chai.expect)(lastRequest.queryParams.filter, '"all" request status filter').to.have.string('status:[draft,scheduled,published]');
                                                (0, _chai.expect)(lastRequest.queryParams.filter, '"all" request page filter').to.have.string('page:[true,false]');

                                                // show all posts by editor
                                                await selectChoose('[data-test-author-select]', editor.name);

                                                // API request is correct

                                                var _server$pretender$han11 = server.pretender.handledRequests.slice(-1);

                                                var _server$pretender$han12 = _slicedToArray(_server$pretender$han11, 1);

                                                lastRequest = _server$pretender$han12[0];

                                                (0, _chai.expect)(lastRequest.queryParams.filter, '"editor" request status filter').to.have.string('status:[draft,scheduled,published]');
                                                (0, _chai.expect)(lastRequest.queryParams.filter, '"editor" request page filter').to.have.string('page:[true,false]');
                                                (0, _chai.expect)(lastRequest.queryParams.filter, '"editor" request filter param').to.have.string(`authors:${editor.slug}`);

                                                // Displays editor post
                                                // TODO: implement "filter" param support and fix mirage post->author association
                                                // expect(find('[data-test-post-id]').length, 'editor post count').to.equal(1);
                                                // expect(find(`[data-test-post-id="${authorPost.id}"]`), 'author post').to.exist;

                                                // TODO: test tags dropdown

                                                // Double-click on a post opens editor
                                                await triggerEvent(`[data-test-post-id="${authorPost.id}"]`, 'dblclick');

                                                (0, _chai.expect)(currentURL(), 'url after double-click').to.equal(`/editor/${authorPost.id}`);
                                    });
                        });

                        (0, _mocha.describe)('as author', function () {
                                    let author, authorPost;

                                    (0, _mocha.beforeEach)(function () {
                                                let authorRole = server.create('role', { name: 'Author' });
                                                author = server.create('user', { roles: [authorRole] });
                                                let adminRole = server.create('role', { name: 'Administrator' });
                                                let admin = server.create('user', { roles: [adminRole] });

                                                // create posts
                                                authorPost = server.create('post', { authors: [author], status: 'published', title: 'Author Post' });
                                                server.create('post', { authors: [admin], status: 'scheduled', title: 'Admin Post' });

                                                return (0, _emberSimpleAuth.authenticateSession)(application);
                                    });

                                    (0, _mocha.it)('only fetches the author\'s posts', async function () {
                                                await visit('/');
                                                // trigger a filter request so we can grab the posts API request easily
                                                await selectChoose('[data-test-type-select]', 'Published posts');

                                                // API request includes author filter

                                                var _server$pretender$han13 = server.pretender.handledRequests.slice(-1),
                                                    _server$pretender$han14 = _slicedToArray(_server$pretender$han13, 1);

                                                let lastRequest = _server$pretender$han14[0];

                                                (0, _chai.expect)(lastRequest.queryParams.filter).to.have.string(`authors:${author.slug}`);

                                                // only author's post is shown
                                                (0, _chai.expect)(find('[data-test-post-id]').length, 'post count').to.equal(1);
                                                (0, _chai.expect)(find(`[data-test-post-id="${authorPost.id}"]`), 'author post').to.exist;
                                    });
                        });

                        (0, _mocha.describe)('as contributor', function () {
                                    let contributor, contributorPost;

                                    (0, _mocha.beforeEach)(function () {
                                                let contributorRole = server.create('role', { name: 'Contributor' });
                                                contributor = server.create('user', { roles: [contributorRole] });
                                                let adminRole = server.create('role', { name: 'Administrator' });
                                                let admin = server.create('user', { roles: [adminRole] });

                                                // Create posts
                                                contributorPost = server.create('post', { authors: [contributor], status: 'draft', title: 'Contributor Post Draft' });
                                                server.create('post', { authors: [contributor], status: 'published', title: 'Contributor Published Post' });
                                                server.create('post', { authors: [admin], status: 'scheduled', title: 'Admin Post' });

                                                return (0, _emberSimpleAuth.authenticateSession)(application);
                                    });

                                    (0, _mocha.it)('only fetches the contributor\'s draft posts', async function () {
                                                await visit('/');

                                                // Ensure the type, tag, and author selectors don't exist
                                                (0, _chai.expect)(find('[data-test-type-select]'), 'type selector').to.not.exist;
                                                (0, _chai.expect)(find('[data-test-tag-select]'), 'tag selector').to.not.exist;
                                                (0, _chai.expect)(find('[data-test-author-select]'), 'author selector').to.not.exist;

                                                // Trigger a sort request
                                                await selectChoose('[data-test-order-select]', 'Oldest');

                                                // API request includes author filter

                                                var _server$pretender$han15 = server.pretender.handledRequests.slice(-1),
                                                    _server$pretender$han16 = _slicedToArray(_server$pretender$han15, 1);

                                                let lastRequest = _server$pretender$han16[0];

                                                (0, _chai.expect)(lastRequest.queryParams.filter).to.have.string(`authors:${contributor.slug}`);

                                                // only contributor's post is shown
                                                (0, _chai.expect)(find('[data-test-post-id]').length, 'post count').to.equal(1);
                                                (0, _chai.expect)(find(`[data-test-post-id="${contributorPost.id}"]`), 'author post').to.exist;
                                    });
                        });
            });
});
define('ghost-admin/tests/acceptance/custom-post-templates-test', ['ghost-admin/utils/ctrl-or-cmd', 'ghost-admin/tests/helpers/destroy-app', 'ghost-admin/tests/helpers/start-app', 'mocha', 'ghost-admin/tests/helpers/ember-simple-auth', 'ember-native-dom-helpers', 'chai'], function (_ctrlOrCmd, _destroyApp, _startApp, _mocha, _emberSimpleAuth, _emberNativeDomHelpers, _chai) {
    'use strict';

    // keyCodes
    const KEY_S = 83;

    (0, _mocha.describe)('Acceptance: Custom Post Templates', function () {
        let application;

        (0, _mocha.beforeEach)(function () {
            application = (0, _startApp.default)();

            server.loadFixtures('settings');

            let role = server.create('role', { name: 'Administrator' });
            server.create('user', { roles: [role] });

            (0, _emberSimpleAuth.authenticateSession)(application);
        });

        (0, _mocha.afterEach)(function () {
            (0, _destroyApp.default)(application);
        });

        (0, _mocha.describe)('with custom templates', function () {
            (0, _mocha.beforeEach)(function () {
                server.create('theme', {
                    active: true,
                    name: 'example-theme',
                    package: {
                        name: 'Example Theme',
                        version: '0.1'
                    },
                    templates: [{
                        filename: 'custom-news-bulletin.hbs',
                        name: 'News Bulletin',
                        for: ['post', 'page'],
                        slug: null
                    }, {
                        filename: 'custom-big-images.hbs',
                        name: 'Big Images',
                        for: ['post', 'page'],
                        slug: null
                    }, {
                        filename: 'post-one.hbs',
                        name: 'One',
                        for: ['post'],
                        slug: 'one'
                    }, {
                        filename: 'page-about.hbs',
                        name: 'About',
                        for: ['page'],
                        slug: 'about'
                    }]
                });
            });

            (0, _mocha.it)('can change selected template', async function () {
                let post = server.create('post', { customTemplate: 'custom-news-bulletin.hbs' });

                await (0, _emberNativeDomHelpers.visit)('/editor/1');
                await (0, _emberNativeDomHelpers.click)('[data-test-psm-trigger]');

                // template form should be shown
                (0, _chai.expect)((0, _emberNativeDomHelpers.find)('[data-test-custom-template-form]')).to.exist;

                // custom template should be selected
                let select = (0, _emberNativeDomHelpers.find)('[data-test-select="custom-template"]');
                (0, _chai.expect)(select.value, 'selected value').to.equal('custom-news-bulletin.hbs');

                // templates list should contain default and custom templates in alphabetical order
                (0, _chai.expect)(select.options.length).to.equal(3);
                (0, _chai.expect)(select.options.item(0).value, 'default value').to.equal('');
                (0, _chai.expect)(select.options.item(0).text, 'default text').to.equal('Default');
                (0, _chai.expect)(select.options.item(1).value, 'first custom value').to.equal('custom-big-images.hbs');
                (0, _chai.expect)(select.options.item(1).text, 'first custom text').to.equal('Big Images');
                (0, _chai.expect)(select.options.item(2).value, 'second custom value').to.equal('custom-news-bulletin.hbs');
                (0, _chai.expect)(select.options.item(2).text, 'second custom text').to.equal('News Bulletin');

                // select the default template
                await (0, _emberNativeDomHelpers.fillIn)(select, '');

                // save then check server record
                await (0, _emberNativeDomHelpers.keyEvent)('.gh-app', 'keydown', KEY_S, {
                    metaKey: _ctrlOrCmd.default === 'command',
                    ctrlKey: _ctrlOrCmd.default === 'ctrl'
                });

                (0, _chai.expect)(server.db.posts.find(post.id).customTemplate, 'saved custom template').to.equal('');
            });

            (0, _mocha.it)('disables template selector if slug matches slug-based template');

            (0, _mocha.it)('doesn\'t query themes endpoint unncessarily', async function () {
                function themeRequests() {
                    return server.pretender.handledRequests.filter(function (request) {
                        return request.url.match(/\/themes\//);
                    });
                }

                server.create('post', { customTemplate: 'custom-news-bulletin.hbs' });

                await (0, _emberNativeDomHelpers.visit)('/editor/1');
                await (0, _emberNativeDomHelpers.click)('[data-test-psm-trigger]');

                (0, _chai.expect)(themeRequests().length, 'after first open').to.equal(1);

                await (0, _emberNativeDomHelpers.click)('[data-test-psm-trigger]'); // hide
                await (0, _emberNativeDomHelpers.click)('[data-test-psm-trigger]'); // show

                (0, _chai.expect)(themeRequests().length, 'after second open').to.equal(1);
            });
        });

        (0, _mocha.describe)('without custom templates', function () {
            (0, _mocha.beforeEach)(function () {
                server.create('theme', {
                    active: true,
                    name: 'example-theme',
                    package: {
                        name: 'Example Theme',
                        version: '0.1'
                    },
                    templates: []
                });
            });

            (0, _mocha.it)('doesn\'t show template selector', async function () {
                server.create('post', { customTemplate: 'custom-news-bulletin.hbs' });

                await (0, _emberNativeDomHelpers.visit)('/editor/1');
                await (0, _emberNativeDomHelpers.click)('[data-test-psm-trigger]');

                // template form should be shown
                (0, _chai.expect)((0, _emberNativeDomHelpers.find)('[data-test-custom-template-form]')).to.not.exist;
            });
        });
    });
});
define('ghost-admin/tests/acceptance/editor-test', ['ember-cli-mirage', 'ghost-admin/tests/helpers/destroy-app', 'moment', 'sinon', 'ghost-admin/tests/helpers/start-app', 'mocha', 'ghost-admin/tests/helpers/ember-simple-auth', 'chai'], function (_emberCliMirage, _destroyApp, _moment, _sinon, _startApp, _mocha, _emberSimpleAuth, _chai) {
            'use strict';

            var _slicedToArray = function () {
                        function sliceIterator(arr, i) {
                                    var _arr = [];
                                    var _n = true;
                                    var _d = false;
                                    var _e = undefined;

                                    try {
                                                for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
                                                            _arr.push(_s.value);

                                                            if (i && _arr.length === i) break;
                                                }
                                    } catch (err) {
                                                _d = true;
                                                _e = err;
                                    } finally {
                                                try {
                                                            if (!_n && _i["return"]) _i["return"]();
                                                } finally {
                                                            if (_d) throw _e;
                                                }
                                    }

                                    return _arr;
                        }

                        return function (arr, i) {
                                    if (Array.isArray(arr)) {
                                                return arr;
                                    } else if (Symbol.iterator in Object(arr)) {
                                                return sliceIterator(arr, i);
                                    } else {
                                                throw new TypeError("Invalid attempt to destructure non-iterable instance");
                                    }
                        };
            }();

            // import {selectChoose} from 'ember-power-select/test-support';

            (0, _mocha.describe)('Acceptance: Editor', function () {
                        let application;

                        (0, _mocha.beforeEach)(function () {
                                    application = (0, _startApp.default)();
                        });

                        (0, _mocha.afterEach)(function () {
                                    (0, _destroyApp.default)(application);
                        });

                        (0, _mocha.it)('redirects to signin when not authenticated', async function () {
                                    let author = server.create('user'); // necesary for post-author association
                                    server.create('post', { authors: [author] });

                                    (0, _emberSimpleAuth.invalidateSession)(application);
                                    await visit('/editor/1');

                                    (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/signin');
                        });

                        (0, _mocha.it)('does not redirect to team page when authenticated as contributor', async function () {
                                    let role = server.create('role', { name: 'Contributor' });
                                    let author = server.create('user', { roles: [role], slug: 'test-user' });
                                    server.create('post', { authors: [author] });

                                    (0, _emberSimpleAuth.authenticateSession)(application);
                                    await visit('/editor/1');

                                    (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/editor/1');
                        });

                        (0, _mocha.it)('does not redirect to team page when authenticated as author', async function () {
                                    let role = server.create('role', { name: 'Author' });
                                    let author = server.create('user', { roles: [role], slug: 'test-user' });
                                    server.create('post', { authors: [author] });

                                    (0, _emberSimpleAuth.authenticateSession)(application);
                                    await visit('/editor/1');

                                    (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/editor/1');
                        });

                        (0, _mocha.it)('does not redirect to team page when authenticated as editor', async function () {
                                    let role = server.create('role', { name: 'Editor' });
                                    let author = server.create('user', { roles: [role], slug: 'test-user' });
                                    server.create('post', { authors: [author] });

                                    (0, _emberSimpleAuth.authenticateSession)(application);
                                    await visit('/editor/1');

                                    (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/editor/1');
                        });

                        (0, _mocha.it)('displays 404 when post does not exist', async function () {
                                    let role = server.create('role', { name: 'Editor' });
                                    server.create('user', { roles: [role], slug: 'test-user' });

                                    (0, _emberSimpleAuth.authenticateSession)(application);
                                    await visit('/editor/1');

                                    (0, _chai.expect)(currentPath()).to.equal('error404');
                                    (0, _chai.expect)(currentURL()).to.equal('/editor/1');
                        });

                        (0, _mocha.it)('when logged in as a contributor, renders a save button instead of a publish menu & hides tags input', async function () {
                                    let role = server.create('role', { name: 'Contributor' });
                                    let author = server.create('user', { roles: [role] });
                                    server.createList('post', 2, { authors: [author] });
                                    server.loadFixtures('settings');
                                    (0, _emberSimpleAuth.authenticateSession)(application);

                                    // post id 1 is a draft, checking for draft behaviour now
                                    await visit('/editor/1');

                                    (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/editor/1');

                                    // Expect publish menu to not exist
                                    (0, _chai.expect)(find('[data-test-publishmenu-trigger]'), 'publish menu trigger').to.not.exist;

                                    // Open post settings menu
                                    await click('[data-test-psm-trigger]');

                                    // Check to make sure that tags input doesn't exist
                                    (0, _chai.expect)(find('[data-test-token-input]'), 'tags input').to.not.exist;

                                    // post id 2 is published, we should be redirected to index
                                    await visit('/editor/2');

                                    (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/');
                        });

                        (0, _mocha.describe)('when logged in', function () {
                                    let author;

                                    (0, _mocha.beforeEach)(function () {
                                                let role = server.create('role', { name: 'Administrator' });
                                                author = server.create('user', { roles: [role] });
                                                server.loadFixtures('settings');

                                                return (0, _emberSimpleAuth.authenticateSession)(application);
                                    });

                                    (0, _mocha.it)('renders the editor correctly, PSM Publish Date and Save Button', async function () {
                                                var _server$createList = server.createList('post', 2, { authors: [author] }),
                                                    _server$createList2 = _slicedToArray(_server$createList, 1);

                                                let post1 = _server$createList2[0];

                                                let futureTime = (0, _moment.default)().tz('Etc/UTC').add(10, 'minutes');

                                                // post id 1 is a draft, checking for draft behaviour now
                                                await visit('/editor/1');

                                                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/editor/1');

                                                // open post settings menu
                                                await click('[data-test-psm-trigger]');

                                                // should error, if the publish time is in the wrong format
                                                await fillIn('[data-test-date-time-picker-time-input]', 'foo');
                                                await triggerEvent('[data-test-date-time-picker-time-input]', 'blur');

                                                (0, _chai.expect)(find('[data-test-date-time-picker-error]').text().trim(), 'inline error response for invalid time').to.equal('Must be in format: "15:00"');

                                                // should error, if the publish time is in the future
                                                // NOTE: date must be selected first, changing the time first will save
                                                // with the new time
                                                await datepickerSelect('[data-test-date-time-picker-datepicker]', _moment.default.tz('Etc/UTC'));
                                                await fillIn('[data-test-date-time-picker-time-input]', futureTime.format('HH:mm'));
                                                await triggerEvent('[data-test-date-time-picker-time-input]', 'blur');

                                                (0, _chai.expect)(find('[data-test-date-time-picker-error]').text().trim(), 'inline error response for future time').to.equal('Must be in the past');

                                                // closing the PSM will reset the invalid date/time
                                                await click('[data-test-close-settings-menu]');
                                                await click('[data-test-psm-trigger]');

                                                (0, _chai.expect)(find('[data-test-date-time-picker-error]').text().trim(), 'date picker error after closing PSM').to.equal('');

                                                (0, _chai.expect)(find('[data-test-date-time-picker-date-input]').val(), 'PSM date value after closing with invalid date').to.equal((0, _moment.default)(post1.publishedAt).tz('Etc/UTC').format('MM/DD/YYYY'));

                                                (0, _chai.expect)(find('[data-test-date-time-picker-time-input]').val(), 'PSM time value after closing with invalid date').to.equal((0, _moment.default)(post1.publishedAt).tz('Etc/UTC').format('HH:mm'));

                                                // saves the post with the new date
                                                let validTime = (0, _moment.default)('2017-04-09 12:00').tz('Etc/UTC');
                                                await fillIn('[data-test-date-time-picker-time-input]', validTime.format('HH:mm'));
                                                await triggerEvent('[data-test-date-time-picker-time-input]', 'blur');
                                                await datepickerSelect('[data-test-date-time-picker-datepicker]', validTime);

                                                // hide psm
                                                await click('[data-test-close-settings-menu]');

                                                // checking the flow of the saving button for a draft
                                                (0, _chai.expect)(find('[data-test-publishmenu-trigger]').text().trim(), 'draft publish button text').to.equal('Publish');

                                                (0, _chai.expect)(find('[data-test-editor-post-status]').text().trim(), 'draft status text').to.equal('Draft');

                                                // click on publish now
                                                await click('[data-test-publishmenu-trigger]');

                                                (0, _chai.expect)(find('[data-test-publishmenu-draft]'), 'draft publish menu is shown').to.exist;

                                                await click('[data-test-publishmenu-scheduled-option]');

                                                (0, _chai.expect)(find('[data-test-publishmenu-save]').text().trim(), 'draft post schedule button text').to.equal('Schedule');

                                                await click('[data-test-publishmenu-published-option]');

                                                (0, _chai.expect)(find('[data-test-publishmenu-save]').text().trim(), 'draft post publish button text').to.equal('Publish');

                                                // Publish the post
                                                await click('[data-test-publishmenu-save]');

                                                (0, _chai.expect)(find('[data-test-publishmenu-save]').text().trim(), 'publish menu save button updated after draft is published').to.equal('Published');

                                                (0, _chai.expect)(find('[data-test-publishmenu-published]'), 'publish menu is shown after draft published').to.exist;

                                                (0, _chai.expect)(find('[data-test-editor-post-status]').text().trim(), 'post status updated after draft published').to.equal('Published');

                                                await click('[data-test-publishmenu-cancel]');
                                                await click('[data-test-publishmenu-trigger]');
                                                await click('[data-test-publishmenu-unpublished-option]');

                                                (0, _chai.expect)(find('[data-test-publishmenu-save]').text().trim(), 'published post unpublish button text').to.equal('Unpublish');

                                                // post id 2 is a published post, checking for published post behaviour now
                                                await visit('/editor/2');

                                                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/editor/2');
                                                (0, _chai.expect)(find('[data-test-date-time-picker-date-input]').val()).to.equal('12/19/2015');
                                                (0, _chai.expect)(find('[data-test-date-time-picker-time-input]').val()).to.equal('16:25');

                                                // saves the post with a new date
                                                await datepickerSelect('[data-test-date-time-picker-datepicker]', (0, _moment.default)('2016-05-10 10:00'));
                                                await fillIn('[data-test-date-time-picker-time-input]', '10:00');
                                                await triggerEvent('[data-test-date-time-picker-time-input]', 'blur');
                                                // saving
                                                await click('[data-test-publishmenu-trigger]');

                                                (0, _chai.expect)(find('[data-test-publishmenu-save]').text().trim(), 'published button text').to.equal('Update');

                                                await click('[data-test-publishmenu-save]');

                                                (0, _chai.expect)(find('[data-test-publishmenu-save]').text().trim(), 'publish menu save button updated after published post is updated').to.equal('Updated');

                                                // go to settings to change the timezone
                                                await visit('/settings/general');
                                                await click('[data-test-toggle-timezone]');

                                                (0, _chai.expect)(currentURL(), 'currentURL for settings').to.equal('/settings/general');
                                                (0, _chai.expect)(find('#activeTimezone option:selected').text().trim(), 'default timezone').to.equal('(GMT) UTC');

                                                // select a new timezone
                                                find('#activeTimezone option[value="Pacific/Kwajalein"]').prop('selected', true);

                                                await triggerEvent('#activeTimezone', 'change');
                                                // save the settings
                                                await click('.gh-btn.gh-btn-blue');

                                                (0, _chai.expect)(find('#activeTimezone option:selected').text().trim(), 'new timezone after saving').to.equal('(GMT +12:00) International Date Line West');

                                                // and now go back to the editor
                                                await visit('/editor/2');

                                                (0, _chai.expect)(currentURL(), 'currentURL in editor').to.equal('/editor/2');

                                                (0, _chai.expect)(find('[data-test-date-time-picker-date-input]').val(), 'date after timezone change').to.equal('05/10/2016');

                                                (0, _chai.expect)(find('[data-test-date-time-picker-time-input]').val(), 'time after timezone change').to.equal('22:00');

                                                // unpublish
                                                await click('[data-test-publishmenu-trigger]');
                                                await click('[data-test-publishmenu-unpublished-option]');

                                                (0, _chai.expect)(find('[data-test-publishmenu-save]').text().trim(), 'published post unpublish button text').to.equal('Unpublish');

                                                await click('[data-test-publishmenu-save]');

                                                (0, _chai.expect)(find('[data-test-publishmenu-save]').text().trim(), 'publish menu save button updated after published post is unpublished').to.equal('Unpublished');

                                                (0, _chai.expect)(find('[data-test-publishmenu-draft]'), 'draft menu is shown after unpublished').to.exist;

                                                (0, _chai.expect)(find('[data-test-editor-post-status]').text().trim(), 'post status updated after unpublished').to.equal('Draft');

                                                // schedule post
                                                await click('[data-test-publishmenu-cancel]');
                                                await click('[data-test-publishmenu-trigger]');

                                                let newFutureTime = _moment.default.tz('Pacific/Kwajalein').add(10, 'minutes');
                                                await click('[data-test-publishmenu-scheduled-option]');

                                                (0, _chai.expect)(find('[data-test-publishmenu-save]').text().trim(), 'draft post, schedule button text').to.equal('Schedule');

                                                await datepickerSelect('[data-test-publishmenu-draft] [data-test-date-time-picker-datepicker]', newFutureTime);
                                                await click('[data-test-publishmenu-save]');

                                                (0, _chai.expect)(find('[data-test-publishmenu-save]').text().trim(), 'publish menu save button updated after draft is scheduled').to.equal('Scheduled');

                                                await click('[data-test-publishmenu-cancel]');

                                                (0, _chai.expect)(find('[data-test-publishmenu-scheduled]'), 'publish menu is not shown after closed').to.not.exist;

                                                // expect countdown to show warning, that post will go live in x minutes
                                                (0, _chai.expect)(find('[data-test-schedule-countdown]').text().trim(), 'notification countdown').to.contain('Post will go live in');

                                                (0, _chai.expect)(find('[data-test-publishmenu-trigger]').text().trim(), 'scheduled publish button text').to.equal('Scheduled');

                                                (0, _chai.expect)(find('[data-test-editor-post-status]').text().trim(), 'scheduled post status').to.equal('Scheduled');

                                                // Re-schedule
                                                await click('[data-test-publishmenu-trigger]');
                                                await click('[data-test-publishmenu-scheduled-option]');
                                                (0, _chai.expect)(find('[data-test-publishmenu-save]').text().trim(), 'scheduled post button reschedule text').to.equal('Reschedule');

                                                await click('[data-test-publishmenu-save]');

                                                (0, _chai.expect)(find('[data-test-publishmenu-save]').text().trim(), 'publish menu save button text for a rescheduled post').to.equal('Rescheduled');

                                                await click('[data-test-publishmenu-cancel]');

                                                (0, _chai.expect)(find('[data-test-publishmenu-scheduled]'), 'publish menu is not shown after closed').to.not.exist;

                                                (0, _chai.expect)(find('[data-test-editor-post-status]').text().trim(), 'scheduled status text').to.equal('Scheduled');

                                                // unschedule
                                                await click('[data-test-publishmenu-trigger]');
                                                await click('[data-test-publishmenu-draft-option]');

                                                (0, _chai.expect)(find('[data-test-publishmenu-save]').text().trim(), 'publish menu save button updated after scheduled post is unscheduled').to.equal('Unschedule');

                                                await click('[data-test-publishmenu-save]');

                                                (0, _chai.expect)(find('[data-test-publishmenu-save]').text().trim(), 'publish menu save button updated after scheduled post is unscheduled').to.equal('Unscheduled');

                                                await click('[data-test-publishmenu-cancel]');

                                                (0, _chai.expect)(find('[data-test-publishmenu-trigger]').text().trim(), 'publish button text after unschedule').to.equal('Publish');

                                                (0, _chai.expect)(find('[data-test-editor-post-status]').text().trim(), 'status text after unschedule').to.equal('Draft');

                                                (0, _chai.expect)(find('[data-test-schedule-countdown]'), 'scheduled countdown after unschedule').to.not.exist;
                                    });

                                    (0, _mocha.it)('handles validation errors when scheduling', async function () {
                                                server.put('/posts/:id/', function () {
                                                            return new _emberCliMirage.default.Response(422, {}, {
                                                                        errors: [{
                                                                                    errorType: 'ValidationError',
                                                                                    message: 'Error test'
                                                                        }]
                                                            });
                                                });

                                                let post = server.create('post', 1, { authors: [author], status: 'draft' });
                                                let plusTenMin = (0, _moment.default)().utc().add(10, 'minutes');

                                                await visit(`/editor/${post.id}`);

                                                await click('[data-test-publishmenu-trigger]');
                                                await click('[data-test-publishmenu-scheduled-option]');
                                                await datepickerSelect('[data-test-publishmenu-draft] [data-test-date-time-picker-datepicker]', plusTenMin);
                                                await fillIn('[data-test-publishmenu-draft] [data-test-date-time-picker-time-input]', plusTenMin.format('HH:mm'));
                                                await triggerEvent('[data-test-publishmenu-draft] [data-test-date-time-picker-time-input]', 'blur');

                                                await click('[data-test-publishmenu-save]');

                                                (0, _chai.expect)(find('.gh-alert').length, 'number of alerts after failed schedule').to.equal(1);

                                                (0, _chai.expect)(find('.gh-alert').text(), 'alert text after failed schedule').to.match(/Saving failed: Error test/);
                                    });

                                    (0, _mocha.it)('handles title validation errors correctly', async function () {
                                                server.create('post', { authors: [author] });

                                                // post id 1 is a draft, checking for draft behaviour now
                                                await visit('/editor/1');

                                                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/editor/1');

                                                await fillIn('[data-test-editor-title-input]', Array(260).join('a'));
                                                await click('[data-test-publishmenu-trigger]');
                                                await click('[data-test-publishmenu-save]');

                                                (0, _chai.expect)(find('.gh-alert').length, 'number of alerts after invalid title').to.equal(1);

                                                (0, _chai.expect)(find('.gh-alert').text(), 'alert text after invalid title').to.match(/Title cannot be longer than 255 characters/);
                                    });

                                    // NOTE: these tests are specific to the mobiledoc editor
                                    // it('inserts a placeholder if the title is blank', async function () {
                                    //     server.createList('post', 1);
                                    //
                                    //     // post id 1 is a draft, checking for draft behaviour now
                                    //     await visit('/editor/1');
                                    //
                                    //     expect(currentURL(), 'currentURL')
                                    //         .to.equal('/editor/1');
                                    //
                                    //     await titleRendered();
                                    //
                                    //     let title = find('#koenig-title-input div');
                                    //     expect(title.data('placeholder')).to.equal('Your Post Title');
                                    //     expect(title.hasClass('no-content')).to.be.false;
                                    //
                                    //     await replaceTitleHTML('');
                                    //     expect(title.hasClass('no-content')).to.be.true;
                                    //
                                    //     await replaceTitleHTML('test');
                                    //     expect(title.hasClass('no-content')).to.be.false;
                                    // });
                                    //
                                    // it('removes HTML from the title.', async function () {
                                    //     server.createList('post', 1);
                                    //
                                    //     // post id 1 is a draft, checking for draft behaviour now
                                    //     await visit('/editor/1');
                                    //
                                    //     expect(currentURL(), 'currentURL')
                                    //         .to.equal('/editor/1');
                                    //
                                    //     await titleRendered();
                                    //
                                    //     let title = find('#koenig-title-input div');
                                    //     await replaceTitleHTML('<div>TITLE&nbsp;&#09;&nbsp;&thinsp;&ensp;&emsp;TEST</div>&nbsp;');
                                    //     expect(title.html()).to.equal('TITLE      TEST ');
                                    // });

                                    (0, _mocha.it)('renders first countdown notification before scheduled time', async function () {
                                                let clock = _sinon.default.useFakeTimers((0, _moment.default)().valueOf());
                                                let compareDate = (0, _moment.default)().tz('Etc/UTC').add(4, 'minutes');
                                                let compareDateString = compareDate.format('MM/DD/YYYY');
                                                let compareTimeString = compareDate.format('HH:mm');
                                                server.create('post', { publishedAt: _moment.default.utc().add(4, 'minutes'), status: 'scheduled', authors: [author] });
                                                server.create('setting', { activeTimezone: 'Europe/Dublin' });
                                                clock.restore();

                                                await visit('/editor/1');

                                                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/editor/1');
                                                (0, _chai.expect)(find('[data-test-date-time-picker-date-input]').val(), 'scheduled date').to.equal(compareDateString);
                                                (0, _chai.expect)(find('[data-test-date-time-picker-time-input]').val(), 'scheduled time').to.equal(compareTimeString);
                                                // Dropdown menu should be 'Update Post' and 'Unschedule'
                                                (0, _chai.expect)(find('[data-test-publishmenu-trigger]').text().trim(), 'text in save button for scheduled post').to.equal('Scheduled');
                                                // expect countdown to show warning, that post will go live in x minutes
                                                (0, _chai.expect)(find('[data-test-schedule-countdown]').text().trim(), 'notification countdown').to.contain('Post will go live in');
                                    });

                                    (0, _mocha.it)('shows author token input and allows changing of authors in PSM', async function () {
                                                let adminRole = server.create('role', { name: 'Adminstrator' });
                                                let authorRole = server.create('role', { name: 'Author' });
                                                let user1 = server.create('user', { name: 'Primary', roles: [adminRole] });
                                                server.create('user', { name: 'Waldo', roles: [authorRole] });
                                                server.create('post', { authors: [user1] });

                                                await visit('/editor/1');

                                                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/editor/1');

                                                await click('button.post-settings');

                                                let tokens = find('[data-test-input="authors"] .ember-power-select-multiple-option');

                                                (0, _chai.expect)(tokens.length).to.equal(1);
                                                (0, _chai.expect)(tokens[0].textContent.trim()).to.have.string('Primary');

                                                await selectChoose('[data-test-input="authors"]', 'Waldo');

                                                let savedAuthors = server.schema.posts.find('1').authors.models;

                                                (0, _chai.expect)(savedAuthors.length).to.equal(2);
                                                (0, _chai.expect)(savedAuthors[0].name).to.equal('Primary');
                                                (0, _chai.expect)(savedAuthors[1].name).to.equal('Waldo');
                                    });

                                    (0, _mocha.it)('autosaves when title loses focus', async function () {
                                                let role = server.create('role', { name: 'Administrator' });
                                                server.create('user', { name: 'Admin', roles: [role] });

                                                await visit('/editor');

                                                // NOTE: there were checks here for the title element having focus
                                                // but they were very temperamental whilst running tests in the
                                                // browser so they've been left out for now

                                                (0, _chai.expect)(currentURL(), 'url on initial visit').to.equal('/editor');

                                                await triggerEvent('[data-test-editor-title-input]', 'blur');

                                                (0, _chai.expect)(find('[data-test-editor-title-input]').val(), 'title value after autosave').to.equal('(Untitled)');

                                                (0, _chai.expect)(currentURL(), 'url after autosave').to.equal('/editor/1');
                                    });

                                    (0, _mocha.it)('saves post settings fields', async function () {
                                                let post = server.create('post', { authors: [author] });

                                                await visit(`/editor/${post.id}`);

                                                // TODO: implement tests for other fields

                                                await click('[data-test-psm-trigger]');

                                                // excerpt has validation
                                                await fillIn('[data-test-field="custom-excerpt"]', Array(302).join('a'));
                                                await triggerEvent('[data-test-field="custom-excerpt"]', 'blur');

                                                (0, _chai.expect)(find('[data-test-error="custom-excerpt"]').text().trim(), 'excerpt too long error').to.match(/cannot be longer than 300/);

                                                (0, _chai.expect)(server.db.posts.find(post.id).customExcerpt, 'saved excerpt after validation error').to.be.null;

                                                // changing custom excerpt auto-saves
                                                await fillIn('[data-test-field="custom-excerpt"]', 'Testing excerpt');
                                                await triggerEvent('[data-test-field="custom-excerpt"]', 'blur');

                                                (0, _chai.expect)(server.db.posts.find(post.id).customExcerpt, 'saved excerpt').to.equal('Testing excerpt');

                                                // -------

                                                // open code injection subview
                                                await click('[data-test-button="codeinjection"]');

                                                // header injection has validation
                                                let headerCM = find('[data-test-field="codeinjection-head"] .CodeMirror')[0].CodeMirror;
                                                await headerCM.setValue(Array(65540).join('a'));
                                                await triggerEvent(headerCM.getInputField(), 'blur');

                                                (0, _chai.expect)(find('[data-test-error="codeinjection-head"]').text().trim(), 'header injection too long error').to.match(/cannot be longer than 65535/);

                                                (0, _chai.expect)(server.db.posts.find(post.id).codeinjectionHead, 'saved header injection after validation error').to.be.null;

                                                // changing header injection auto-saves
                                                await headerCM.setValue('<script src="http://example.com/inject-head.js"></script>');
                                                await triggerEvent(headerCM.getInputField(), 'blur');

                                                (0, _chai.expect)(server.db.posts.find(post.id).codeinjectionHead, 'saved header injection').to.equal('<script src="http://example.com/inject-head.js"></script>');

                                                // footer injection has validation
                                                let footerCM = find('[data-test-field="codeinjection-foot"] .CodeMirror')[0].CodeMirror;
                                                await footerCM.setValue(Array(65540).join('a'));
                                                await triggerEvent(footerCM.getInputField(), 'blur');

                                                (0, _chai.expect)(find('[data-test-error="codeinjection-foot"]').text().trim(), 'footer injection too long error').to.match(/cannot be longer than 65535/);

                                                (0, _chai.expect)(server.db.posts.find(post.id).codeinjectionFoot, 'saved footer injection after validation error').to.be.null;

                                                // changing footer injection auto-saves
                                                await footerCM.setValue('<script src="http://example.com/inject-foot.js"></script>');
                                                await triggerEvent(footerCM.getInputField(), 'blur');

                                                (0, _chai.expect)(server.db.posts.find(post.id).codeinjectionFoot, 'saved footer injection').to.equal('<script src="http://example.com/inject-foot.js"></script>');

                                                // closing subview switches back to main PSM view
                                                await click('[data-test-button="close-psm-subview"]');

                                                (0, _chai.expect)(find('[data-test-field="codeinjection-head"]').length, 'header injection not present after closing subview').to.equal(0);

                                                // -------

                                                // open twitter data subview
                                                await click('[data-test-button="twitter-data"]');

                                                // twitter title has validation
                                                await fillIn('[data-test-field="twitter-title"]', Array(302).join('a'));
                                                await triggerEvent('[data-test-field="twitter-title"]', 'blur');

                                                (0, _chai.expect)(find('[data-test-error="twitter-title"]').text().trim(), 'twitter title too long error').to.match(/cannot be longer than 300/);

                                                (0, _chai.expect)(server.db.posts.find(post.id).twitterTitle, 'saved twitter title after validation error').to.be.null;

                                                // changing twitter title auto-saves
                                                // twitter title has validation
                                                await fillIn('[data-test-field="twitter-title"]', 'Test Twitter Title');
                                                await triggerEvent('[data-test-field="twitter-title"]', 'blur');

                                                (0, _chai.expect)(server.db.posts.find(post.id).twitterTitle, 'saved twitter title').to.equal('Test Twitter Title');

                                                // twitter description has validation
                                                await fillIn('[data-test-field="twitter-description"]', Array(505).join('a'));
                                                await triggerEvent('[data-test-field="twitter-description"]', 'blur');

                                                (0, _chai.expect)(find('[data-test-error="twitter-description"]').text().trim(), 'twitter description too long error').to.match(/cannot be longer than 500/);

                                                (0, _chai.expect)(server.db.posts.find(post.id).twitterDescription, 'saved twitter description after validation error').to.be.null;

                                                // changing twitter description auto-saves
                                                // twitter description has validation
                                                await fillIn('[data-test-field="twitter-description"]', 'Test Twitter Description');
                                                await triggerEvent('[data-test-field="twitter-description"]', 'blur');

                                                (0, _chai.expect)(server.db.posts.find(post.id).twitterDescription, 'saved twitter description').to.equal('Test Twitter Description');

                                                // closing subview switches back to main PSM view
                                                await click('[data-test-button="close-psm-subview"]');

                                                (0, _chai.expect)(find('[data-test-field="twitter-title"]').length, 'twitter title not present after closing subview').to.equal(0);

                                                // -------

                                                // open facebook data subview
                                                await click('[data-test-button="facebook-data"]');

                                                // facebook title has validation
                                                await fillIn('[data-test-field="og-title"]', Array(302).join('a'));
                                                await triggerEvent('[data-test-field="og-title"]', 'blur');

                                                (0, _chai.expect)(find('[data-test-error="og-title"]').text().trim(), 'facebook title too long error').to.match(/cannot be longer than 300/);

                                                (0, _chai.expect)(server.db.posts.find(post.id).ogTitle, 'saved facebook title after validation error').to.be.null;

                                                // changing facebook title auto-saves
                                                // facebook title has validation
                                                await fillIn('[data-test-field="og-title"]', 'Test Facebook Title');
                                                await triggerEvent('[data-test-field="og-title"]', 'blur');

                                                (0, _chai.expect)(server.db.posts.find(post.id).ogTitle, 'saved facebook title').to.equal('Test Facebook Title');

                                                // facebook description has validation
                                                await fillIn('[data-test-field="og-description"]', Array(505).join('a'));
                                                await triggerEvent('[data-test-field="og-description"]', 'blur');

                                                (0, _chai.expect)(find('[data-test-error="og-description"]').text().trim(), 'facebook description too long error').to.match(/cannot be longer than 500/);

                                                (0, _chai.expect)(server.db.posts.find(post.id).ogDescription, 'saved facebook description after validation error').to.be.null;

                                                // changing facebook description auto-saves
                                                // facebook description has validation
                                                await fillIn('[data-test-field="og-description"]', 'Test Facebook Description');
                                                await triggerEvent('[data-test-field="og-description"]', 'blur');

                                                (0, _chai.expect)(server.db.posts.find(post.id).ogDescription, 'saved facebook description').to.equal('Test Facebook Description');

                                                // closing subview switches back to main PSM view
                                                await click('[data-test-button="close-psm-subview"]');

                                                (0, _chai.expect)(find('[data-test-field="og-title"]').length, 'facebook title not present after closing subview').to.equal(0);
                                    });
                        });
            });
});
define('ghost-admin/tests/acceptance/error-handling-test', ['ember-cli-mirage', 'ghost-admin/tests/helpers/destroy-app', 'ghost-admin/tests/helpers/start-app', 'mocha', 'ghost-admin/tests/helpers/ember-simple-auth', 'chai', 'ghost-admin/mirage/utils'], function (_emberCliMirage, _destroyApp, _startApp, _mocha, _emberSimpleAuth, _chai, _utils) {
    'use strict';

    var _slicedToArray = function () {
        function sliceIterator(arr, i) {
            var _arr = [];
            var _n = true;
            var _d = false;
            var _e = undefined;

            try {
                for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
                    _arr.push(_s.value);

                    if (i && _arr.length === i) break;
                }
            } catch (err) {
                _d = true;
                _e = err;
            } finally {
                try {
                    if (!_n && _i["return"]) _i["return"]();
                } finally {
                    if (_d) throw _e;
                }
            }

            return _arr;
        }

        return function (arr, i) {
            if (Array.isArray(arr)) {
                return arr;
            } else if (Symbol.iterator in Object(arr)) {
                return sliceIterator(arr, i);
            } else {
                throw new TypeError("Invalid attempt to destructure non-iterable instance");
            }
        };
    }();

    let htmlErrorResponse = function htmlErrorResponse() {
        return new _emberCliMirage.default.Response(504, { 'Content-Type': 'text/html' }, '<!DOCTYPE html><head><title>Server Error</title></head><body>504 Gateway Timeout</body></html>');
    };

    (0, _mocha.describe)('Acceptance: Error Handling', function () {
        let application;

        (0, _mocha.beforeEach)(function () {
            application = (0, _startApp.default)();
        });

        (0, _mocha.afterEach)(function () {
            (0, _destroyApp.default)(application);
        });

        (0, _mocha.describe)('VersionMismatch errors', function () {
            (0, _mocha.describe)('logged in', function () {
                (0, _mocha.beforeEach)(function () {
                    let role = server.create('role', { name: 'Administrator' });
                    server.create('user', { roles: [role] });

                    return (0, _emberSimpleAuth.authenticateSession)(application);
                });

                (0, _mocha.it)('displays an alert and disables navigation when saving', async function () {
                    server.createList('post', 3);

                    // mock the post save endpoint to return version mismatch
                    server.put('/posts/:id', _utils.versionMismatchResponse);

                    await visit('/');
                    await click('.posts-list li:nth-of-type(2) a'); // select second post
                    await click('[data-test-publishmenu-trigger]');
                    await click('[data-test-publishmenu-save]'); // "Save post"

                    // has the refresh to update alert
                    (0, _chai.expect)(find('.gh-alert').length).to.equal(1);
                    (0, _chai.expect)(find('.gh-alert').text()).to.match(/refresh/);

                    // try navigating back to the content list
                    await click('.gh-nav-main-content');

                    (0, _chai.expect)(currentPath()).to.equal('editor.edit');
                });

                (0, _mocha.it)('displays alert and aborts the transition when navigating', async function () {
                    await visit('/');

                    // mock the tags endpoint to return version mismatch
                    server.get('/tags/', _utils.versionMismatchResponse);

                    await click('.gh-nav-settings-tags');

                    // navigation is blocked on loading screen
                    (0, _chai.expect)(currentPath()).to.equal('settings.tags_loading');

                    // has the refresh to update alert
                    (0, _chai.expect)(find('.gh-alert').length).to.equal(1);
                    (0, _chai.expect)(find('.gh-alert').text()).to.match(/refresh/);
                });

                (0, _mocha.it)('displays alert and aborts the transition when an ember-ajax error is thrown whilst navigating', async function () {
                    server.get('/configuration/timezones/', _utils.versionMismatchResponse);

                    await visit('/settings/tags');
                    await click('.gh-nav-settings-general');

                    // navigation is blocked
                    (0, _chai.expect)(currentPath()).to.equal('settings.general_loading');

                    // has the refresh to update alert
                    (0, _chai.expect)(find('.gh-alert').length).to.equal(1);
                    (0, _chai.expect)(find('.gh-alert').text()).to.match(/refresh/);
                });

                (0, _mocha.it)('can be triggered when passed in to a component', async function () {
                    server.post('/subscribers/csv/', _utils.versionMismatchResponse);

                    await visit('/subscribers');
                    await click('.gh-btn:contains("Import CSV")');
                    await fileUpload('.fullscreen-modal input[type="file"]', ['test'], { name: 'test.csv' });

                    // alert is shown
                    (0, _chai.expect)(find('.gh-alert').length).to.equal(1);
                    (0, _chai.expect)(find('.gh-alert').text()).to.match(/refresh/);
                });
            });

            (0, _mocha.describe)('logged out', function () {
                (0, _mocha.it)('displays alert', async function () {
                    server.post('/authentication/token', _utils.versionMismatchResponse);

                    await visit('/signin');
                    await fillIn('[name="identification"]', 'test@example.com');
                    await fillIn('[name="password"]', 'password');
                    await click('.gh-btn-blue');

                    // has the refresh to update alert
                    (0, _chai.expect)(find('.gh-alert').length).to.equal(1);
                    (0, _chai.expect)(find('.gh-alert').text()).to.match(/refresh/);
                });
            });
        });

        (0, _mocha.describe)('CloudFlare errors', function () {
            (0, _mocha.beforeEach)(function () {
                var _server$db$roles$wher = server.db.roles.where({ name: 'Administrator' }),
                    _server$db$roles$wher2 = _slicedToArray(_server$db$roles$wher, 1);

                let role = _server$db$roles$wher2[0];

                server.create('user', { roles: [role] });

                server.loadFixtures();

                (0, _emberSimpleAuth.authenticateSession)(application);
            });

            (0, _mocha.it)('handles Ember Data HTML response', async function () {
                server.put('/posts/1/', htmlErrorResponse);
                server.create('post');

                await visit('/editor/1');
                await click('[data-test-publishmenu-trigger]');
                await click('[data-test-publishmenu-save]');

                andThen(() => {
                    (0, _chai.expect)(find('.gh-alert').length).to.equal(1);
                    (0, _chai.expect)(find('.gh-alert').text()).to.not.match(/html>/);
                    (0, _chai.expect)(find('.gh-alert').text()).to.match(/Request was rejected due to server error/);
                });
            });

            (0, _mocha.it)('handles ember-ajax HTML response', async function () {
                server.del('/themes/foo/', htmlErrorResponse);

                await visit('/settings/design');
                await click('[data-test-theme-id="foo"] [data-test-theme-delete-button]');
                await click('.fullscreen-modal [data-test-delete-button]');

                andThen(() => {
                    (0, _chai.expect)(find('.gh-alert').length).to.equal(1);
                    (0, _chai.expect)(find('.gh-alert').text()).to.not.match(/html>/);
                    (0, _chai.expect)(find('.gh-alert').text()).to.match(/Request was rejected due to server error/);
                });
            });
        });
    });
});
define('ghost-admin/tests/acceptance/ghost-desktop-test', ['ghost-admin/tests/helpers/destroy-app', 'ghost-admin/tests/helpers/start-app', 'mocha', 'ghost-admin/tests/helpers/ember-simple-auth', 'chai'], function (_destroyApp, _startApp, _mocha, _emberSimpleAuth, _chai) {
    'use strict';

    const originalAgent = window.navigator.userAgent;

    const setUserAgent = function setUserAgent(userAgent) {
        let userAgentProp = {
            get() {
                return userAgent;
            },
            configurable: true
        };

        try {
            Object.defineProperty(window.navigator, 'userAgent', userAgentProp);
        } catch (e) {
            window.navigator = Object.create(window.navigator, {
                userAgent: userAgentProp
            });
        }
    };

    const restoreUserAgent = function restoreUserAgent() {
        setUserAgent(originalAgent);
    };

    (0, _mocha.describe)('Acceptance: Ghost Desktop', function () {
        let application;

        (0, _mocha.beforeEach)(function () {
            application = (0, _startApp.default)();
        });

        (0, _mocha.afterEach)(function () {
            (0, _destroyApp.default)(application);
        });

        (0, _mocha.describe)('update alerts for broken versions', function () {
            (0, _mocha.beforeEach)(function () {
                let role = server.create('role', { name: 'Administrator' });
                server.create('user', { roles: [role] });

                return (0, _emberSimpleAuth.authenticateSession)(application);
            });

            (0, _mocha.afterEach)(function () {
                restoreUserAgent();
            });

            (0, _mocha.it)('displays alert for broken version', async function () {
                setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) ghost-desktop/0.4.0 Chrome/51.0.2704.84 Electron/1.2.2 Safari/537.36');

                await visit('/');

                // has an alert with matching text
                (0, _chai.expect)(find('.gh-alert-blue').length, 'number of warning alerts').to.equal(1);
                (0, _chai.expect)(find('.gh-alert-blue').text().trim(), 'alert text').to.match(/Your version of Ghost Desktop needs to be manually updated/);
            });

            (0, _mocha.it)('doesn\'t display alert for working version', async function () {
                setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) ghost-desktop/0.5.1 Chrome/51.0.2704.84 Electron/1.2.2 Safari/537.36');

                await visit('/');

                // no alerts
                (0, _chai.expect)(find('.gh-alert').length, 'number of alerts').to.equal(0);
            });
        });
    });
});
define('ghost-admin/tests/acceptance/password-reset-test', ['ghost-admin/tests/helpers/destroy-app', 'ghost-admin/tests/helpers/start-app', 'mocha', 'chai'], function (_destroyApp, _startApp, _mocha, _chai) {
    'use strict';

    (0, _mocha.describe)('Acceptance: Password Reset', function () {
        let application;

        (0, _mocha.beforeEach)(function () {
            application = (0, _startApp.default)();
        });

        (0, _mocha.afterEach)(function () {
            (0, _destroyApp.default)(application);
        });

        (0, _mocha.describe)('request reset', function () {
            (0, _mocha.it)('is successful with valid data', async function () {
                await visit('/signin');
                await fillIn('input[name="identification"]', 'test@example.com');
                await click('.forgotten-link');

                // an alert with instructions is displayed
                (0, _chai.expect)(find('.gh-alert-blue').length, 'alert count').to.equal(1);
            });

            (0, _mocha.it)('shows error messages with invalid data', async function () {
                await visit('/signin');

                // no email provided
                await click('.forgotten-link');

                // email field is invalid
                (0, _chai.expect)(find('input[name="identification"]').closest('.form-group').hasClass('error'), 'email field has error class (no email)').to.be.true;

                // password field is valid
                (0, _chai.expect)(find('input[name="password"]').closest('.form-group').hasClass('error'), 'password field has error class (no email)').to.be.false;

                // error message shown
                (0, _chai.expect)(find('p.main-error').text().trim(), 'error message').to.equal('We need your email address to reset your password!');

                // invalid email provided
                await fillIn('input[name="identification"]', 'test');
                await click('.forgotten-link');

                // email field is invalid
                (0, _chai.expect)(find('input[name="identification"]').closest('.form-group').hasClass('error'), 'email field has error class (invalid email)').to.be.true;

                // password field is valid
                (0, _chai.expect)(find('input[name="password"]').closest('.form-group').hasClass('error'), 'password field has error class (invalid email)').to.be.false;

                // error message
                (0, _chai.expect)(find('p.main-error').text().trim(), 'error message').to.equal('We need your email address to reset your password!');

                // unknown email provided
                await fillIn('input[name="identification"]', 'unknown@example.com');
                await click('.forgotten-link');

                // email field is invalid
                (0, _chai.expect)(find('input[name="identification"]').closest('.form-group').hasClass('error'), 'email field has error class (unknown email)').to.be.true;

                // password field is valid
                (0, _chai.expect)(find('input[name="password"]').closest('.form-group').hasClass('error'), 'password field has error class (unknown email)').to.be.false;

                // error message
                (0, _chai.expect)(find('p.main-error').text().trim(), 'error message').to.equal('There is no user with that email address.');
            });
        });

        // TODO: add tests for the change password screen
    });
});
define('ghost-admin/tests/acceptance/settings/amp-test', ['ghost-admin/utils/ctrl-or-cmd', 'ghost-admin/tests/helpers/destroy-app', 'ghost-admin/tests/helpers/start-app', 'mocha', 'ghost-admin/tests/helpers/ember-simple-auth', 'chai'], function (_ctrlOrCmd, _destroyApp, _startApp, _mocha, _emberSimpleAuth, _chai) {
            'use strict';

            var _slicedToArray = function () {
                        function sliceIterator(arr, i) {
                                    var _arr = [];
                                    var _n = true;
                                    var _d = false;
                                    var _e = undefined;

                                    try {
                                                for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
                                                            _arr.push(_s.value);

                                                            if (i && _arr.length === i) break;
                                                }
                                    } catch (err) {
                                                _d = true;
                                                _e = err;
                                    } finally {
                                                try {
                                                            if (!_n && _i["return"]) _i["return"]();
                                                } finally {
                                                            if (_d) throw _e;
                                                }
                                    }

                                    return _arr;
                        }

                        return function (arr, i) {
                                    if (Array.isArray(arr)) {
                                                return arr;
                                    } else if (Symbol.iterator in Object(arr)) {
                                                return sliceIterator(arr, i);
                                    } else {
                                                throw new TypeError("Invalid attempt to destructure non-iterable instance");
                                    }
                        };
            }();

            (0, _mocha.describe)('Acceptance: Settings - Apps - AMP', function () {
                        let application;

                        (0, _mocha.beforeEach)(function () {
                                    application = (0, _startApp.default)();
                        });

                        (0, _mocha.afterEach)(function () {
                                    (0, _destroyApp.default)(application);
                        });

                        (0, _mocha.it)('redirects to signin when not authenticated', async function () {
                                    (0, _emberSimpleAuth.invalidateSession)(application);
                                    await visit('/settings/apps/amp');

                                    (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/signin');
                        });

                        (0, _mocha.it)('redirects to team page when authenticated as contributor', async function () {
                                    let role = server.create('role', { name: 'Contributor' });
                                    server.create('user', { roles: [role], slug: 'test-user' });

                                    (0, _emberSimpleAuth.authenticateSession)(application);
                                    await visit('/settings/apps/amp');

                                    (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team/test-user');
                        });

                        (0, _mocha.it)('redirects to team page when authenticated as author', async function () {
                                    let role = server.create('role', { name: 'Author' });
                                    server.create('user', { roles: [role], slug: 'test-user' });

                                    (0, _emberSimpleAuth.authenticateSession)(application);
                                    await visit('/settings/apps/amp');

                                    (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team/test-user');
                        });

                        (0, _mocha.it)('redirects to team page when authenticated as editor', async function () {
                                    let role = server.create('role', { name: 'Editor' });
                                    server.create('user', { roles: [role], slug: 'test-user' });

                                    (0, _emberSimpleAuth.authenticateSession)(application);
                                    await visit('/settings/apps/amp');

                                    (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team');
                        });

                        (0, _mocha.describe)('when logged in', function () {
                                    (0, _mocha.beforeEach)(function () {
                                                let role = server.create('role', { name: 'Administrator' });
                                                server.create('user', { roles: [role] });

                                                return (0, _emberSimpleAuth.authenticateSession)(application);
                                    });

                                    (0, _mocha.it)('it enables or disables AMP properly and saves it', async function () {
                                                await visit('/settings/apps/amp');

                                                // has correct url
                                                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/apps/amp');

                                                // AMP is enabled by default
                                                (0, _chai.expect)(find('[data-test-amp-checkbox]').prop('checked'), 'AMP checkbox').to.be.true;

                                                await click('[data-test-amp-checkbox]');

                                                (0, _chai.expect)(find('[data-test-amp-checkbox]').prop('checked'), 'AMP checkbox').to.be.false;

                                                await click('[data-test-save-button]');

                                                var _server$pretender$han = server.pretender.handledRequests.slice(-1),
                                                    _server$pretender$han2 = _slicedToArray(_server$pretender$han, 1);

                                                let lastRequest = _server$pretender$han2[0];

                                                let params = JSON.parse(lastRequest.requestBody);

                                                (0, _chai.expect)(params.settings.findBy('key', 'amp').value).to.equal(false);

                                                // CMD-S shortcut works
                                                await click('[data-test-amp-checkbox]');
                                                await triggerEvent('.gh-app', 'keydown', {
                                                            keyCode: 83, // s
                                                            metaKey: _ctrlOrCmd.default === 'command',
                                                            ctrlKey: _ctrlOrCmd.default === 'ctrl'
                                                });

                                                // we've already saved in this test so there's no on-screen indication
                                                // that we've had another save, check the request was fired instead

                                                var _server$pretender$han3 = server.pretender.handledRequests.slice(-1),
                                                    _server$pretender$han4 = _slicedToArray(_server$pretender$han3, 1);

                                                let newRequest = _server$pretender$han4[0];

                                                params = JSON.parse(newRequest.requestBody);

                                                (0, _chai.expect)(find('[data-test-amp-checkbox]').prop('checked'), 'AMP checkbox').to.be.true;
                                                (0, _chai.expect)(params.settings.findBy('key', 'amp').value).to.equal(true);
                                    });

                                    (0, _mocha.it)('warns when leaving without saving', async function () {
                                                await visit('/settings/apps/amp');

                                                // has correct url
                                                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/apps/amp');

                                                // AMP is enabled by default
                                                (0, _chai.expect)(find('[data-test-amp-checkbox]').prop('checked'), 'AMP checkbox').to.be.true;

                                                await click('[data-test-amp-checkbox]');

                                                (0, _chai.expect)(find('[data-test-amp-checkbox]').prop('checked'), 'AMP checkbox').to.be.false;

                                                await visit('/team');

                                                (0, _chai.expect)(find('.fullscreen-modal').length, 'modal exists').to.equal(1);

                                                // Leave without saving
                                                await (click('.fullscreen-modal [data-test-leave-button]'), 'leave without saving');

                                                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team');

                                                await visit('/settings/apps/amp');

                                                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/apps/amp');

                                                // settings were not saved
                                                (0, _chai.expect)(find('[data-test-amp-checkbox]').prop('checked'), 'AMP checkbox').to.be.true;
                                    });
                        });
            });
});
define('ghost-admin/tests/acceptance/settings/apps-test', ['ghost-admin/tests/helpers/destroy-app', 'ghost-admin/tests/helpers/start-app', 'mocha', 'ghost-admin/tests/helpers/ember-simple-auth', 'chai'], function (_destroyApp, _startApp, _mocha, _emberSimpleAuth, _chai) {
    'use strict';

    (0, _mocha.describe)('Acceptance: Settings - Apps', function () {
        let application;

        (0, _mocha.beforeEach)(function () {
            application = (0, _startApp.default)();
        });

        (0, _mocha.afterEach)(function () {
            (0, _destroyApp.default)(application);
        });

        (0, _mocha.it)('redirects to signin when not authenticated', async function () {
            (0, _emberSimpleAuth.invalidateSession)(application);
            await visit('/settings/apps');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/signin');
        });

        (0, _mocha.it)('redirects to team page when authenticated as contributor', async function () {
            let role = server.create('role', { name: 'Contributor' });
            server.create('user', { roles: [role], slug: 'test-user' });

            (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/settings/apps');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team/test-user');
        });

        (0, _mocha.it)('redirects to team page when authenticated as author', async function () {
            let role = server.create('role', { name: 'Author' });
            server.create('user', { roles: [role], slug: 'test-user' });

            (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/settings/apps');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team/test-user');
        });

        (0, _mocha.it)('redirects to team page when authenticated as editor', async function () {
            let role = server.create('role', { name: 'Editor' });
            server.create('user', { roles: [role], slug: 'test-user' });

            (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/settings/apps');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team');
        });

        (0, _mocha.describe)('when logged in', function () {
            (0, _mocha.beforeEach)(function () {
                let role = server.create('role', { name: 'Administrator' });
                server.create('user', { roles: [role] });

                return (0, _emberSimpleAuth.authenticateSession)(application);
            });

            (0, _mocha.it)('renders correctly', async function () {
                await visit('/settings/apps');

                // slack is not configured in the fixtures
                (0, _chai.expect)(find('[data-test-app="slack"] [data-test-app-status]').text().trim(), 'slack app status').to.equal('Configure');

                // amp is enabled in the fixtures
                (0, _chai.expect)(find('[data-test-app="amp"] [data-test-app-status]').text().trim(), 'amp app status').to.equal('Active');
            });

            (0, _mocha.it)('it redirects to Slack when clicking on the grid', async function () {
                await visit('/settings/apps');

                // has correct url
                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/apps');

                await click('[data-test-link="slack"]');

                // has correct url
                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/apps/slack');
            });

            (0, _mocha.it)('it redirects to AMP when clicking on the grid', async function () {
                await visit('/settings/apps');

                // has correct url
                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/apps');

                await click('[data-test-link="amp"]');

                // has correct url
                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/apps/amp');
            });

            (0, _mocha.it)('it redirects to Unsplash when clicking on the grid', async function () {
                await visit('/settings/apps');

                // has correct url
                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/apps');

                await click('[data-test-link="unsplash"]');

                // has correct url
                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/apps/unsplash');
            });
        });
    });
});
define('ghost-admin/tests/acceptance/settings/code-injection-test', ['ghost-admin/utils/ctrl-or-cmd', 'ghost-admin/tests/helpers/destroy-app', 'ghost-admin/tests/helpers/start-app', 'mocha', 'ghost-admin/tests/helpers/ember-simple-auth', 'chai'], function (_ctrlOrCmd, _destroyApp, _startApp, _mocha, _emberSimpleAuth, _chai) {
    'use strict';

    var _slicedToArray = function () {
        function sliceIterator(arr, i) {
            var _arr = [];
            var _n = true;
            var _d = false;
            var _e = undefined;

            try {
                for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
                    _arr.push(_s.value);

                    if (i && _arr.length === i) break;
                }
            } catch (err) {
                _d = true;
                _e = err;
            } finally {
                try {
                    if (!_n && _i["return"]) _i["return"]();
                } finally {
                    if (_d) throw _e;
                }
            }

            return _arr;
        }

        return function (arr, i) {
            if (Array.isArray(arr)) {
                return arr;
            } else if (Symbol.iterator in Object(arr)) {
                return sliceIterator(arr, i);
            } else {
                throw new TypeError("Invalid attempt to destructure non-iterable instance");
            }
        };
    }();

    (0, _mocha.describe)('Acceptance: Settings - Code-Injection', function () {
        let application;

        (0, _mocha.beforeEach)(function () {
            application = (0, _startApp.default)();
        });

        (0, _mocha.afterEach)(function () {
            (0, _destroyApp.default)(application);
        });

        (0, _mocha.it)('redirects to signin when not authenticated', async function () {
            (0, _emberSimpleAuth.invalidateSession)(application);
            await visit('/settings/code-injection');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/signin');
        });

        (0, _mocha.it)('redirects to team page when authenticated as contributor', async function () {
            let role = server.create('role', { name: 'Contributor' });
            server.create('user', { roles: [role], slug: 'test-user' });

            (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/settings/code-injection');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team/test-user');
        });

        (0, _mocha.it)('redirects to team page when authenticated as author', async function () {
            let role = server.create('role', { name: 'Author' });
            server.create('user', { roles: [role], slug: 'test-user' });

            (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/settings/code-injection');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team/test-user');
        });

        (0, _mocha.it)('redirects to team page when authenticated as editor', async function () {
            let role = server.create('role', { name: 'Editor' });
            server.create('user', { roles: [role], slug: 'test-user' });

            (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/settings/code-injection');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team');
        });

        (0, _mocha.describe)('when logged in', function () {
            (0, _mocha.beforeEach)(function () {
                let role = server.create('role', { name: 'Administrator' });
                server.create('user', { roles: [role] });

                return (0, _emberSimpleAuth.authenticateSession)(application);
            });

            (0, _mocha.it)('it renders, loads and saves editors correctly', async function () {
                await visit('/settings/code-injection');

                // has correct url
                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/code-injection');

                // has correct page title
                (0, _chai.expect)(document.title, 'page title').to.equal('Settings - Code injection - Test Blog');

                // highlights nav menu
                (0, _chai.expect)(Ember.$('.gh-nav-settings-code-injection').hasClass('active'), 'highlights nav menu item').to.be.true;

                (0, _chai.expect)(find('[data-test-save-button]').text().trim(), 'save button text').to.equal('Save');

                (0, _chai.expect)(find('#ghost-head .CodeMirror').length, 'ghost head codemirror element').to.equal(1);
                (0, _chai.expect)(Ember.$('#ghost-head .CodeMirror').hasClass('cm-s-xq-light'), 'ghost head editor theme').to.be.true;

                (0, _chai.expect)(find('#ghost-foot .CodeMirror').length, 'ghost head codemirror element').to.equal(1);
                (0, _chai.expect)(Ember.$('#ghost-foot .CodeMirror').hasClass('cm-s-xq-light'), 'ghost head editor theme').to.be.true;

                await click('[data-test-save-button]');

                var _server$pretender$han = server.pretender.handledRequests.slice(-1),
                    _server$pretender$han2 = _slicedToArray(_server$pretender$han, 1);

                let lastRequest = _server$pretender$han2[0];

                let params = JSON.parse(lastRequest.requestBody);

                (0, _chai.expect)(params.settings.findBy('key', 'ghost_head').value).to.equal('');
                (0, _chai.expect)(find('[data-test-save-button]').text().trim(), 'save button text').to.equal('Saved');

                // CMD-S shortcut works
                await triggerEvent('.gh-app', 'keydown', {
                    keyCode: 83, // s
                    metaKey: _ctrlOrCmd.default === 'command',
                    ctrlKey: _ctrlOrCmd.default === 'ctrl'
                });
                // we've already saved in this test so there's no on-screen indication
                // that we've had another save, check the request was fired instead

                var _server$pretender$han3 = server.pretender.handledRequests.slice(-1),
                    _server$pretender$han4 = _slicedToArray(_server$pretender$han3, 1);

                let newRequest = _server$pretender$han4[0];

                params = JSON.parse(newRequest.requestBody);

                (0, _chai.expect)(params.settings.findBy('key', 'ghost_head').value).to.equal('');
                (0, _chai.expect)(find('[data-test-save-button]').text().trim(), 'save button text').to.equal('Saved');
            });
        });
    });
});
define('ghost-admin/tests/acceptance/settings/design-test', ['ember-cli-mirage', 'ghost-admin/utils/ctrl-or-cmd', 'ghost-admin/tests/helpers/destroy-app', 'ghost-admin/mirage/config/themes', 'ghost-admin/tests/helpers/start-app', 'mocha', 'ghost-admin/tests/helpers/ember-simple-auth', 'chai'], function (_emberCliMirage, _ctrlOrCmd, _destroyApp, _themes, _startApp, _mocha, _emberSimpleAuth, _chai) {
    'use strict';

    var _slicedToArray = function () {
        function sliceIterator(arr, i) {
            var _arr = [];
            var _n = true;
            var _d = false;
            var _e = undefined;

            try {
                for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
                    _arr.push(_s.value);

                    if (i && _arr.length === i) break;
                }
            } catch (err) {
                _d = true;
                _e = err;
            } finally {
                try {
                    if (!_n && _i["return"]) _i["return"]();
                } finally {
                    if (_d) throw _e;
                }
            }

            return _arr;
        }

        return function (arr, i) {
            if (Array.isArray(arr)) {
                return arr;
            } else if (Symbol.iterator in Object(arr)) {
                return sliceIterator(arr, i);
            } else {
                throw new TypeError("Invalid attempt to destructure non-iterable instance");
            }
        };
    }();

    (0, _mocha.describe)('Acceptance: Settings - Design', function () {
        let application;

        (0, _mocha.beforeEach)(function () {
            application = (0, _startApp.default)();
        });

        (0, _mocha.afterEach)(function () {
            (0, _destroyApp.default)(application);
        });

        (0, _mocha.it)('redirects to signin when not authenticated', async function () {
            (0, _emberSimpleAuth.invalidateSession)(application);
            await visit('/settings/design');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/signin');
        });

        (0, _mocha.it)('redirects to team page when authenticated as contributor', async function () {
            let role = server.create('role', { name: 'Contributor' });
            server.create('user', { roles: [role], slug: 'test-user' });

            (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/settings/design');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team/test-user');
        });

        (0, _mocha.it)('redirects to team page when authenticated as author', async function () {
            let role = server.create('role', { name: 'Author' });
            server.create('user', { roles: [role], slug: 'test-user' });

            (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/settings/design');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team/test-user');
        });

        (0, _mocha.describe)('when logged in', function () {
            (0, _mocha.beforeEach)(function () {
                let role = server.create('role', { name: 'Administrator' });
                server.create('user', { roles: [role] });

                (0, _emberSimpleAuth.authenticateSession)(application);
            });

            (0, _mocha.it)('can visit /settings/design', async function () {
                await visit('/settings/design');

                (0, _chai.expect)(currentPath()).to.equal('settings.design.index');
                (0, _chai.expect)(find('[data-test-save-button]').text().trim(), 'save button text').to.equal('Save');

                // fixtures contain two nav items, check for three rows as we
                // should have one extra that's blank
                (0, _chai.expect)(find('.gh-blognav-item').length, 'navigation items count').to.equal(3);
            });

            (0, _mocha.it)('saves navigation settings', async function () {
                await visit('/settings/design');
                await fillIn('.gh-blognav-label:first input', 'Test');
                await fillIn('.gh-blognav-url:first input', '/test');
                await triggerEvent('.gh-blognav-url:first input', 'blur');

                await click('[data-test-save-button]');

                var _server$db$settings$w = server.db.settings.where({ key: 'navigation' }),
                    _server$db$settings$w2 = _slicedToArray(_server$db$settings$w, 1);

                let navSetting = _server$db$settings$w2[0];


                (0, _chai.expect)(navSetting.value).to.equal('[{"label":"Test","url":"/test/"},{"label":"About","url":"/about"}]');

                // don't test against .error directly as it will pick up failed
                // tests "pre.error" elements
                (0, _chai.expect)(find('span.error').length, 'error fields count').to.equal(0);
                (0, _chai.expect)(find('.gh-alert').length, 'alerts count').to.equal(0);
                (0, _chai.expect)(find('.response:visible').length, 'validation errors count').to.equal(0);
            });

            (0, _mocha.it)('validates new item correctly on save', async function () {
                await visit('/settings/design');

                await click('[data-test-save-button]');

                (0, _chai.expect)(find('.gh-blognav-item').length, 'number of nav items after saving with blank new item').to.equal(3);

                await fillIn('.gh-blognav-label:last input', 'Test');
                await fillIn('.gh-blognav-url:last input', 'http://invalid domain/');
                await triggerEvent('.gh-blognav-url:last input', 'blur');

                await click('[data-test-save-button]');

                (0, _chai.expect)(find('.gh-blognav-item').length, 'number of nav items after saving with invalid new item').to.equal(3);

                (0, _chai.expect)(find('.gh-blognav-item:last .error').length, 'number of invalid fields in new item').to.equal(1);
            });

            (0, _mocha.it)('clears unsaved settings when navigating away but warns with a confirmation dialog', async function () {
                await visit('/settings/design');
                await fillIn('.gh-blognav-label:first input', 'Test');
                await triggerEvent('.gh-blognav-label:first input', 'blur');

                (0, _chai.expect)(find('.gh-blognav-label:first input').val()).to.equal('Test');
                // this.timeout(0);
                // return pauseTest();

                await visit('/settings/code-injection');

                (0, _chai.expect)(find('.fullscreen-modal').length, 'modal exists').to.equal(1);

                // Leave without saving
                await (click('.fullscreen-modal [data-test-leave-button]'), 'leave without saving');

                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/code-injection');

                await visit('/settings/design');

                (0, _chai.expect)(find('.gh-blognav-label:first input').val()).to.equal('Home');
            });

            (0, _mocha.it)('can add and remove items', async function () {
                await visit('/settings/design');
                await click('.gh-blognav-add');

                (0, _chai.expect)(find('.gh-blognav-label:last .response').is(':visible'), 'blank label has validation error').to.be.true;

                await fillIn('.gh-blognav-label:last input', 'New');
                await triggerEvent('.gh-blognav-label:last input', 'keypress', {});

                (0, _chai.expect)(find('.gh-blognav-label:last .response').is(':visible'), 'label validation is visible after typing').to.be.false;

                await fillIn('.gh-blognav-url:last input', '/new');
                await triggerEvent('.gh-blognav-url:last input', 'keypress', {});
                await triggerEvent('.gh-blognav-url:last input', 'blur');

                (0, _chai.expect)(find('.gh-blognav-url:last .response').is(':visible'), 'url validation is visible after typing').to.be.false;

                (0, _chai.expect)(find('.gh-blognav-url:last input').val()).to.equal(`${window.location.origin}/new`);

                await click('.gh-blognav-add');

                (0, _chai.expect)(find('.gh-blognav-item').length, 'number of nav items after successful add').to.equal(4);

                (0, _chai.expect)(find('.gh-blognav-label:last input').val(), 'new item label value after successful add').to.be.empty;

                (0, _chai.expect)(find('.gh-blognav-url:last input').val(), 'new item url value after successful add').to.equal(`${window.location.origin}/`);

                (0, _chai.expect)(find('.gh-blognav-item .response:visible').length, 'number or validation errors shown after successful add').to.equal(0);

                await click('.gh-blognav-item:first .gh-blognav-delete');

                (0, _chai.expect)(find('.gh-blognav-item').length, 'number of nav items after successful remove').to.equal(3);

                // CMD-S shortcut works
                await triggerEvent('.gh-app', 'keydown', {
                    keyCode: 83, // s
                    metaKey: _ctrlOrCmd.default === 'command',
                    ctrlKey: _ctrlOrCmd.default === 'ctrl'
                });

                var _server$db$settings$w3 = server.db.settings.where({ key: 'navigation' }),
                    _server$db$settings$w4 = _slicedToArray(_server$db$settings$w3, 1);

                let navSetting = _server$db$settings$w4[0];


                (0, _chai.expect)(navSetting.value).to.equal('[{"label":"About","url":"/about"},{"label":"New","url":"/new/"}]');
            });

            (0, _mocha.it)('allows management of themes', async function () {
                // lists available themes + active theme is highlighted

                // theme upload
                // - displays modal
                // - validates mime type
                // - validates casper.zip
                // - handles validation errors
                // - handles upload and close
                // - handles upload and activate
                // - displays overwrite warning if theme already exists

                // theme activation
                // - switches theme

                // theme deletion
                // - displays modal
                // - deletes theme and refreshes list

                server.loadFixtures('themes');
                await visit('/settings/design');

                // lists available themes (themes are specified in mirage/fixtures/settings)
                (0, _chai.expect)(find('[data-test-theme-id]').length, 'shows correct number of themes').to.equal(3);

                (0, _chai.expect)(find('[data-test-theme-active="true"] [data-test-theme-title]').text().trim(), 'Blog theme marked as active').to.equal('Blog (default)');

                // theme upload displays modal
                await click('[data-test-upload-theme-button]');
                (0, _chai.expect)(find('.fullscreen-modal .modal-content:contains("Upload a theme")').length, 'theme upload modal displayed after button click').to.equal(1);

                // cancelling theme upload closes modal
                await click('.fullscreen-modal [data-test-close-button]');
                (0, _chai.expect)(find('.fullscreen-modal').length === 0, 'upload theme modal is closed when cancelling').to.be.true;

                // theme upload validates mime type
                await click('[data-test-upload-theme-button]');
                await fileUpload('.fullscreen-modal input[type="file"]', ['test'], { type: 'text/csv' });
                (0, _chai.expect)(find('.fullscreen-modal .failed').text(), 'validation error is shown for invalid mime type').to.match(/is not supported/);

                // theme upload validates casper.zip
                await click('[data-test-upload-try-again-button]');
                await fileUpload('.fullscreen-modal input[type="file"]', ['test'], { name: 'casper.zip', type: 'application/zip' });
                (0, _chai.expect)(find('.fullscreen-modal .failed').text(), 'validation error is shown when uploading casper.zip').to.match(/default Casper theme cannot be overwritten/);

                // theme upload handles upload errors
                server.post('/themes/upload/', function () {
                    return new _emberCliMirage.default.Response(422, {}, {
                        errors: [{
                            message: 'Invalid theme'
                        }]
                    });
                });
                await click('[data-test-upload-try-again-button]');
                await fileUpload('.fullscreen-modal input[type="file"]', ['test'], { name: 'error.zip', type: 'application/zip' });
                (0, _chai.expect)(find('.fullscreen-modal .failed').text().trim(), 'validation error is passed through from server').to.equal('Invalid theme');

                // reset to default mirage handlers
                (0, _themes.default)(server);

                // theme upload handles validation errors
                server.post('/themes/upload/', function () {
                    return new _emberCliMirage.default.Response(422, {}, {
                        errors: [{
                            message: 'Theme is not compatible or contains errors.',
                            errorType: 'ThemeValidationError',
                            errorDetails: [{
                                level: 'error',
                                rule: 'Assets such as CSS & JS must use the <code>{{asset}}</code> helper',
                                details: '<p>The listed files should be included using the <code>{{asset}}</code> helper.</p>',
                                failures: [{
                                    ref: '/assets/javascripts/ui.js'
                                }]
                            }, {
                                level: 'error',
                                rule: 'Templates must contain valid Handlebars.',
                                failures: [{
                                    ref: 'index.hbs',
                                    message: 'The partial index_meta could not be found'
                                }, {
                                    ref: 'tag.hbs',
                                    message: 'The partial index_meta could not be found'
                                }]
                            }]
                        }]
                    });
                });

                await click('[data-test-upload-try-again-button]');
                await fileUpload('.fullscreen-modal input[type="file"]', ['test'], { name: 'bad-theme.zip', type: 'application/zip' });

                (0, _chai.expect)(find('.fullscreen-modal h1').text().trim(), 'modal title after uploading invalid theme').to.equal('Invalid theme');

                (0, _chai.expect)(find('.theme-validation-rule-text').text(), 'top-level errors are displayed').to.match(/Templates must contain valid Handlebars/);

                await click('[data-test-toggle-details]');

                (0, _chai.expect)(find('.theme-validation-details').text(), 'top-level errors do not escape HTML').to.match(/The listed files should be included using the {{asset}} helper/);

                (0, _chai.expect)(find('.theme-validation-list ul li').text(), 'individual failures are displayed').to.match(/\/assets\/javascripts\/ui\.js/);

                // reset to default mirage handlers
                (0, _themes.default)(server);

                await click('.fullscreen-modal [data-test-try-again-button]');
                (0, _chai.expect)(find('.theme-validation-errors').length, '"Try Again" resets form after theme validation error').to.equal(0);

                (0, _chai.expect)(find('.gh-image-uploader').length, '"Try Again" resets form after theme validation error').to.equal(1);

                (0, _chai.expect)(find('.fullscreen-modal h1').text().trim(), '"Try Again" resets form after theme validation error').to.equal('Upload a theme');

                // theme upload handles validation warnings
                server.post('/themes/upload/', function ({ themes }) {
                    let theme = {
                        name: 'blackpalm',
                        package: {
                            name: 'BlackPalm',
                            version: '1.0.0'
                        }
                    };

                    themes.create(theme);

                    theme.warnings = [{
                        level: 'warning',
                        rule: 'Assets such as CSS & JS must use the <code>{{asset}}</code> helper',
                        details: '<p>The listed files should be included using the <code>{{asset}}</code> helper.  For more information, please see the <a href="http://themes.ghost.org/docs/asset">asset helper documentation</a>.</p>',
                        failures: [{
                            ref: '/assets/dist/img/apple-touch-icon.png'
                        }, {
                            ref: '/assets/dist/img/favicon.ico'
                        }, {
                            ref: '/assets/dist/css/blackpalm.min.css'
                        }, {
                            ref: '/assets/dist/js/blackpalm.min.js'
                        }],
                        code: 'GS030-ASSET-REQ'
                    }];

                    return new _emberCliMirage.default.Response(200, {}, {
                        themes: [theme]
                    });
                });

                await fileUpload('.fullscreen-modal input[type="file"]', ['test'], { name: 'warning-theme.zip', type: 'application/zip' });

                (0, _chai.expect)(find('.fullscreen-modal h1').text().trim(), 'modal title after uploading theme with warnings').to.equal('Upload successful with warnings');

                await click('[data-test-toggle-details]');

                (0, _chai.expect)(find('.theme-validation-details').text(), 'top-level warnings are displayed').to.match(/The listed files should be included using the {{asset}} helper/);

                (0, _chai.expect)(find('.theme-validation-list ul li').text(), 'individual warning failures are displayed').to.match(/\/assets\/dist\/img\/apple-touch-icon\.png/);

                // reset to default mirage handlers
                (0, _themes.default)(server);

                await click('.fullscreen-modal [data-test-close-button]');

                // theme upload handles success then close
                await click('[data-test-upload-theme-button]');
                await fileUpload('.fullscreen-modal input[type="file"]', ['test'], { name: 'theme-1.zip', type: 'application/zip' });

                (0, _chai.expect)(find('.fullscreen-modal h1').text().trim(), 'modal header after successful upload').to.equal('Upload successful!');

                (0, _chai.expect)(find('.modal-body').text(), 'modal displays theme name after successful upload').to.match(/"Test 1 - 0\.1" uploaded successfully/);

                (0, _chai.expect)(find('[data-test-theme-id]').length, 'number of themes in list grows after upload').to.equal(5);

                (0, _chai.expect)(find('[data-test-theme-active="true"] [data-test-theme-title]').text().trim(), 'newly uploaded theme is not active').to.equal('Blog (default)');

                await click('.fullscreen-modal [data-test-close-button]');

                // theme upload handles success then activate
                await click('[data-test-upload-theme-button]');
                await fileUpload('.fullscreen-modal input[type="file"]', ['test'], { name: 'theme-2.zip', type: 'application/zip' });
                await click('.fullscreen-modal [data-test-activate-now-button]');

                (0, _chai.expect)(find('[data-test-theme-id]').length, 'number of themes in list grows after upload and activate').to.equal(6);

                (0, _chai.expect)(find('[data-test-theme-active="true"] [data-test-theme-title]').text().trim(), 'newly uploaded+activated theme is active').to.equal('Test 2');

                // theme activation switches active theme
                await click('[data-test-theme-id="casper"] [data-test-theme-activate-button]');

                (0, _chai.expect)(find('[data-test-theme-id="test-2"] .apps-card-app').hasClass('theme-list-item--active'), 'previously active theme is not active').to.be.false;

                (0, _chai.expect)(find('[data-test-theme-id="casper"] .apps-card-app').hasClass('theme-list-item--active'), 'activated theme is active').to.be.true;

                // theme activation shows errors
                server.put('themes/:theme/activate', function () {
                    return new _emberCliMirage.default.Response(422, {}, {
                        errors: [{
                            message: 'Theme is not compatible or contains errors.',
                            errorType: 'ThemeValidationError',
                            errorDetails: [{
                                level: 'error',
                                rule: 'Assets such as CSS & JS must use the <code>{{asset}}</code> helper',
                                details: '<p>The listed files should be included using the <code>{{asset}}</code> helper.</p>',
                                failures: [{
                                    ref: '/assets/javascripts/ui.js'
                                }]
                            }, {
                                level: 'error',
                                rule: 'Templates must contain valid Handlebars.',
                                failures: [{
                                    ref: 'index.hbs',
                                    message: 'The partial index_meta could not be found'
                                }, {
                                    ref: 'tag.hbs',
                                    message: 'The partial index_meta could not be found'
                                }]
                            }]
                        }]
                    });
                });

                await click('[data-test-theme-id="test-2"] [data-test-theme-activate-button]');

                (0, _chai.expect)(find('[data-test-theme-warnings-modal]')).to.exist;

                (0, _chai.expect)(find('[data-test-theme-warnings-title]').text().trim(), 'modal title after activating invalid theme').to.equal('Activation failed');

                (0, _chai.expect)(find('[data-test-theme-warnings]').text(), 'top-level errors are displayed in activation errors').to.match(/Templates must contain valid Handlebars/);

                await click('[data-test-toggle-details]');

                (0, _chai.expect)(find('.theme-validation-details').text(), 'top-level errors do not escape HTML in activation errors').to.match(/The listed files should be included using the {{asset}} helper/);

                (0, _chai.expect)(find('.theme-validation-list ul li').text(), 'individual failures are displayed in activation errors').to.match(/\/assets\/javascripts\/ui\.js/);

                // restore default mirage handlers
                (0, _themes.default)(server);

                await click('[data-test-modal-close-button]');
                (0, _chai.expect)(find('[data-test-theme-warnings-modal]')).to.not.exist;

                // theme activation shows warnings
                server.put('themes/:theme/activate', function ({ themes }, { params }) {
                    themes.all().update('active', false);
                    let theme = themes.findBy({ name: params.theme }).update({ active: true });

                    theme.update({ warnings: [{
                            level: 'warning',
                            rule: 'Assets such as CSS & JS must use the <code>{{asset}}</code> helper',
                            details: '<p>The listed files should be included using the <code>{{asset}}</code> helper.  For more information, please see the <a href="http://themes.ghost.org/docs/asset">asset helper documentation</a>.</p>',
                            failures: [{
                                ref: '/assets/dist/img/apple-touch-icon.png'
                            }, {
                                ref: '/assets/dist/img/favicon.ico'
                            }, {
                                ref: '/assets/dist/css/blackpalm.min.css'
                            }, {
                                ref: '/assets/dist/js/blackpalm.min.js'
                            }],
                            code: 'GS030-ASSET-REQ'
                        }] });

                    return { themes: [theme] };
                });

                await click('[data-test-theme-id="test-2"] [data-test-theme-activate-button]');

                (0, _chai.expect)(find('[data-test-theme-warnings-modal]')).to.exist;

                (0, _chai.expect)(find('[data-test-theme-warnings-title]').text().trim(), 'modal title after activating theme with warnings').to.equal('Activation successful with warnings');

                await click('[data-test-toggle-details]');

                (0, _chai.expect)(find('.theme-validation-details').text(), 'top-level warnings are displayed in activation warnings').to.match(/The listed files should be included using the {{asset}} helper/);

                (0, _chai.expect)(find('.theme-validation-list ul li').text(), 'individual warning failures are displayed in activation warnings').to.match(/\/assets\/dist\/img\/apple-touch-icon\.png/);

                // restore default mirage handlers
                (0, _themes.default)(server);

                await click('[data-test-modal-close-button]');
                // reactivate casper to continue tests
                await click('[data-test-theme-id="casper"] [data-test-theme-activate-button]');

                // theme deletion displays modal
                await click('[data-test-theme-id="test-1"] [data-test-theme-delete-button]');
                (0, _chai.expect)(find('[data-test-delete-theme-modal]').length, 'theme deletion modal displayed after button click').to.equal(1);

                // cancelling theme deletion closes modal
                await click('.fullscreen-modal [data-test-cancel-button]');
                (0, _chai.expect)(find('.fullscreen-modal').length === 0, 'delete theme modal is closed when cancelling').to.be.true;

                // confirming theme deletion closes modal and refreshes list
                await click('[data-test-theme-id="test-1"] [data-test-theme-delete-button]');
                await click('.fullscreen-modal [data-test-delete-button]');
                (0, _chai.expect)(find('.fullscreen-modal').length === 0, 'delete theme modal closes after deletion').to.be.true;

                (0, _chai.expect)(find('[data-test-theme-id]').length, 'number of themes in list shrinks after delete').to.equal(5);

                (0, _chai.expect)(find('[data-test-theme-title]').text(), 'correct theme is removed from theme list after deletion').to.not.match(/Test 1/);

                // validation errors are handled when deleting a theme
                server.del('/themes/:theme/', function () {
                    return new _emberCliMirage.default.Response(422, {}, {
                        errors: [{
                            message: 'Can\'t delete theme'
                        }]
                    });
                });

                await click('[data-test-theme-id="test-2"] [data-test-theme-delete-button]');
                await click('.fullscreen-modal [data-test-delete-button]');

                (0, _chai.expect)(find('.fullscreen-modal').length === 0, 'delete theme modal closes after failed deletion').to.be.true;

                (0, _chai.expect)(find('.gh-alert').length, 'alert is shown when deletion fails').to.equal(1);

                (0, _chai.expect)(find('.gh-alert').text(), 'failed deletion alert has correct text').to.match(/Can't delete theme/);

                // restore default mirage handlers
                (0, _themes.default)(server);
            });

            (0, _mocha.it)('can delete then re-upload the same theme', async function () {
                server.loadFixtures('themes');

                // mock theme upload to emulate uploading theme with same id
                server.post('/themes/upload/', function ({ themes }) {
                    let theme = themes.create({
                        name: 'foo',
                        package: {
                            name: 'Foo',
                            version: '0.1'
                        }
                    });

                    return { themes: [theme] };
                });

                await visit('/settings/design');
                await click('[data-test-theme-id="foo"] [data-test-theme-delete-button]');
                await click('.fullscreen-modal [data-test-delete-button]');

                await click('[data-test-upload-theme-button]');
                await fileUpload('.fullscreen-modal input[type="file"]', ['test'], { name: 'foo.zip', type: 'application/zip' });
                // this will fail if upload failed because there won't be an activate now button
                await click('.fullscreen-modal [data-test-activate-now-button]');
            });
        });
    });
});
define('ghost-admin/tests/acceptance/settings/general-test', ['ghost-admin/utils/ctrl-or-cmd', 'ghost-admin/tests/helpers/destroy-app', 'ghost-admin/mirage/config/uploads', 'ghost-admin/tests/helpers/start-app', 'ember-test-helpers/wait', 'mocha', 'ghost-admin/tests/helpers/ember-simple-auth', 'chai'], function (_ctrlOrCmd, _destroyApp, _uploads, _startApp, _wait, _mocha, _emberSimpleAuth, _chai) {
    'use strict';

    var _slicedToArray = function () {
        function sliceIterator(arr, i) {
            var _arr = [];
            var _n = true;
            var _d = false;
            var _e = undefined;

            try {
                for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
                    _arr.push(_s.value);

                    if (i && _arr.length === i) break;
                }
            } catch (err) {
                _d = true;
                _e = err;
            } finally {
                try {
                    if (!_n && _i["return"]) _i["return"]();
                } finally {
                    if (_d) throw _e;
                }
            }

            return _arr;
        }

        return function (arr, i) {
            if (Array.isArray(arr)) {
                return arr;
            } else if (Symbol.iterator in Object(arr)) {
                return sliceIterator(arr, i);
            } else {
                throw new TypeError("Invalid attempt to destructure non-iterable instance");
            }
        };
    }();

    (0, _mocha.describe)('Acceptance: Settings - General', function () {
        let application;

        (0, _mocha.beforeEach)(function () {
            application = (0, _startApp.default)();
        });

        (0, _mocha.afterEach)(function () {
            (0, _destroyApp.default)(application);
        });

        (0, _mocha.it)('redirects to signin when not authenticated', async function () {
            (0, _emberSimpleAuth.invalidateSession)(application);
            await visit('/settings/general');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/signin');
        });

        (0, _mocha.it)('redirects to team page when authenticated as contributor', async function () {
            let role = server.create('role', { name: 'Contributor' });
            server.create('user', { roles: [role], slug: 'test-user' });

            (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/settings/general');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team/test-user');
        });

        (0, _mocha.it)('redirects to team page when authenticated as author', async function () {
            let role = server.create('role', { name: 'Author' });
            server.create('user', { roles: [role], slug: 'test-user' });

            (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/settings/general');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team/test-user');
        });

        (0, _mocha.it)('redirects to team page when authenticated as editor', async function () {
            let role = server.create('role', { name: 'Editor' });
            server.create('user', { roles: [role], slug: 'test-user' });

            (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/settings/general');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team');
        });

        (0, _mocha.describe)('when logged in', function () {
            (0, _mocha.beforeEach)(function () {
                let role = server.create('role', { name: 'Administrator' });
                server.create('user', { roles: [role] });

                return (0, _emberSimpleAuth.authenticateSession)(application);
            });

            (0, _mocha.it)('it renders, handles image uploads', async function () {
                await visit('/settings/general');

                // has correct url
                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/general');

                // has correct page title
                (0, _chai.expect)(document.title, 'page title').to.equal('Settings - General - Test Blog');

                // highlights nav menu
                (0, _chai.expect)(Ember.$('.gh-nav-settings-general').hasClass('active'), 'highlights nav menu item').to.be.true;

                (0, _chai.expect)(find('[data-test-save-button]').text().trim(), 'save button text').to.equal('Save settings');

                await click('[data-test-toggle-pub-info]');
                await fillIn('[data-test-title-input]', 'New Blog Title');
                await click('[data-test-save-button]');
                (0, _chai.expect)(document.title, 'page title').to.equal('Settings - General - New Blog Title');

                // blog icon upload
                // -------------------------------------------------------------- //

                // has fixture icon
                (0, _chai.expect)(find('[data-test-icon-img]').attr('src'), 'initial icon src').to.equal('/content/images/2014/Feb/favicon.ico');

                // delete removes icon + shows button
                await click('[data-test-delete-image="icon"]');
                (0, _chai.expect)(find('[data-test-icon-img]'), 'icon img after removal').to.not.exist;
                (0, _chai.expect)(find('[data-test-image-upload-btn="icon"]'), 'icon upload button after removal').to.exist;

                // select file
                fileUpload('[data-test-file-input="icon"]', ['test'], { name: 'pub-icon.ico', type: 'image/x-icon' });

                // check progress bar exists during upload
                Ember.run.later(() => {
                    (0, _chai.expect)(find('[data-test-setting="icon"] [data-test-progress-bar]'), 'icon upload progress bar').to.exist;
                }, 50);

                // wait for upload to finish and check image is shown
                await (0, _wait.default)();
                (0, _chai.expect)(find('[data-test-icon-img]').attr('src'), 'icon img after upload').to.match(/pub-icon\.ico$/);
                (0, _chai.expect)(find('[data-test-image-upload-btn="icon"]'), 'icon upload button after upload').to.not.exist;

                // failed upload shows error
                server.post('/uploads/icon/', function () {
                    return {
                        errors: [{
                            errorType: 'ValidationError',
                            message: 'Wrong icon size'
                        }]
                    };
                }, 422);
                await click('[data-test-delete-image="icon"]');
                await fileUpload('[data-test-file-input="icon"]', ['test'], { name: 'pub-icon.ico', type: 'image/x-icon' });
                (0, _chai.expect)(find('[data-test-error="icon"]').text().trim(), 'failed icon upload message').to.equal('Wrong icon size');

                // reset upload endpoints
                (0, _uploads.default)(server);

                // blog logo upload
                // -------------------------------------------------------------- //

                // has fixture icon
                (0, _chai.expect)(find('[data-test-logo-img]').attr('src'), 'initial logo src').to.equal('/content/images/2013/Nov/logo.png');

                // delete removes logo + shows button
                await click('[data-test-delete-image="logo"]');
                (0, _chai.expect)(find('[data-test-logo-img]'), 'logo img after removal').to.not.exist;
                (0, _chai.expect)(find('[data-test-image-upload-btn="logo"]'), 'logo upload button after removal').to.exist;

                // select file
                fileUpload('[data-test-file-input="logo"]', ['test'], { name: 'pub-logo.png', type: 'image/png' });

                // check progress bar exists during upload
                Ember.run.later(() => {
                    (0, _chai.expect)(find('[data-test-setting="logo"] [data-test-progress-bar]'), 'logo upload progress bar').to.exist;
                }, 50);

                // wait for upload to finish and check image is shown
                await (0, _wait.default)();
                (0, _chai.expect)(find('[data-test-logo-img]').attr('src'), 'logo img after upload').to.match(/pub-logo\.png$/);
                (0, _chai.expect)(find('[data-test-image-upload-btn="logo"]'), 'logo upload button after upload').to.not.exist;

                // failed upload shows error
                server.post('/uploads/', function () {
                    return {
                        errors: [{
                            errorType: 'ValidationError',
                            message: 'Wrong logo size'
                        }]
                    };
                }, 422);
                await click('[data-test-delete-image="logo"]');
                await fileUpload('[data-test-file-input="logo"]', ['test'], { name: 'pub-logo.png', type: 'image/png' });
                (0, _chai.expect)(find('[data-test-error="logo"]').text().trim(), 'failed logo upload message').to.equal('Wrong logo size');

                // reset upload endpoints
                (0, _uploads.default)(server);

                // blog cover upload
                // -------------------------------------------------------------- //

                // has fixture icon
                (0, _chai.expect)(find('[data-test-cover-img]').attr('src'), 'initial coverImage src').to.equal('/content/images/2014/Feb/cover.jpg');

                // delete removes coverImage + shows button
                await click('[data-test-delete-image="coverImage"]');
                (0, _chai.expect)(find('[data-test-coverImage-img]'), 'coverImage img after removal').to.not.exist;
                (0, _chai.expect)(find('[data-test-image-upload-btn="coverImage"]'), 'coverImage upload button after removal').to.exist;

                // select file
                fileUpload('[data-test-file-input="coverImage"]', ['test'], { name: 'pub-coverImage.png', type: 'image/png' });

                // check progress bar exists during upload
                Ember.run.later(() => {
                    (0, _chai.expect)(find('[data-test-setting="coverImage"] [data-test-progress-bar]'), 'coverImage upload progress bar').to.exist;
                }, 50);

                // wait for upload to finish and check image is shown
                await (0, _wait.default)();
                (0, _chai.expect)(find('[data-test-cover-img]').attr('src'), 'coverImage img after upload').to.match(/pub-coverImage\.png$/);
                (0, _chai.expect)(find('[data-test-image-upload-btn="coverImage"]'), 'coverImage upload button after upload').to.not.exist;

                // failed upload shows error
                server.post('/uploads/', function () {
                    return {
                        errors: [{
                            errorType: 'ValidationError',
                            message: 'Wrong coverImage size'
                        }]
                    };
                }, 422);
                await click('[data-test-delete-image="coverImage"]');
                await fileUpload('[data-test-file-input="coverImage"]', ['test'], { name: 'pub-coverImage.png', type: 'image/png' });
                (0, _chai.expect)(find('[data-test-error="coverImage"]').text().trim(), 'failed coverImage upload message').to.equal('Wrong coverImage size');

                // reset upload endpoints
                (0, _uploads.default)(server);

                // CMD-S shortcut works
                // -------------------------------------------------------------- //
                await fillIn('[data-test-title-input]', 'CMD-S Test');
                await triggerEvent('.gh-app', 'keydown', {
                    keyCode: 83, // s
                    metaKey: _ctrlOrCmd.default === 'command',
                    ctrlKey: _ctrlOrCmd.default === 'ctrl'
                });
                // we've already saved in this test so there's no on-screen indication
                // that we've had another save, check the request was fired instead

                var _server$pretender$han = server.pretender.handledRequests.slice(-1),
                    _server$pretender$han2 = _slicedToArray(_server$pretender$han, 1);

                let lastRequest = _server$pretender$han2[0];

                let params = JSON.parse(lastRequest.requestBody);
                (0, _chai.expect)(params.settings.findBy('key', 'title').value).to.equal('CMD-S Test');
            });

            (0, _mocha.it)('renders timezone selector correctly', async function () {
                await visit('/settings/general');
                await click('[data-test-toggle-timezone]');

                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/general');

                (0, _chai.expect)(find('#activeTimezone option').length, 'available timezones').to.equal(66);
                (0, _chai.expect)(find('#activeTimezone option:selected').text().trim()).to.equal('(GMT) UTC');
                find('#activeTimezone option[value="Africa/Cairo"]').prop('selected', true);

                await triggerEvent('#activeTimezone', 'change');
                await click('[data-test-save-button]');
                (0, _chai.expect)(find('#activeTimezone option:selected').text().trim()).to.equal('(GMT +2:00) Cairo, Egypt');
            });

            (0, _mocha.it)('handles private blog settings correctly', async function () {
                await visit('/settings/general');

                // handles private blog settings correctly
                (0, _chai.expect)(find('[data-test-private-checkbox]').prop('checked'), 'isPrivate checkbox').to.be.false;

                await click('[data-test-private-checkbox]');

                (0, _chai.expect)(find('[data-test-private-checkbox]').prop('checked'), 'isPrivate checkbox').to.be.true;
                (0, _chai.expect)(find('[data-test-password-input]').length, 'password input').to.equal(1);
                (0, _chai.expect)(find('[data-test-password-input]').val(), 'password default value').to.not.equal('');

                await fillIn('[data-test-password-input]', '');
                await triggerEvent('[data-test-password-input]', 'blur');

                (0, _chai.expect)(find('[data-test-password-error]').text().trim(), 'empty password error').to.equal('Password must be supplied');

                await fillIn('[data-test-password-input]', 'asdfg');
                await triggerEvent('[data-test-password-input]', 'blur');

                (0, _chai.expect)(find('[data-test-password-error]').text().trim(), 'present password error').to.equal('');
            });

            (0, _mocha.it)('handles social blog settings correctly', async function () {
                let testSocialInput = async function testSocialInput(type, input, expectedValue, expectedError = '') {
                    await fillIn(`[data-test-${type}-input]`, input);
                    await triggerEvent(`[data-test-${type}-input]`, 'blur');

                    (0, _chai.expect)(find(`[data-test-${type}-input]`).val(), `${type} value for ${input}`).to.equal(expectedValue);

                    (0, _chai.expect)(find(`[data-test-${type}-error]`).text().trim(), `${type} validation response for ${input}`).to.equal(expectedError);

                    (0, _chai.expect)(find(`[data-test-${type}-input]`).closest('.form-group').hasClass('error'), `${type} input should be in error state with '${input}'`).to.equal(!!expectedError);
                };

                let testFacebookValidation = async (...args) => testSocialInput('facebook', ...args);
                let testTwitterValidation = async (...args) => testSocialInput('twitter', ...args);

                await visit('/settings/general');
                await click('[data-test-toggle-social]');

                // validates a facebook url correctly
                // loads fixtures and performs transform
                (0, _chai.expect)(find('[data-test-facebook-input]').val(), 'initial facebook value').to.equal('https://www.facebook.com/test');

                await triggerEvent('[data-test-facebook-input]', 'focus');
                await triggerEvent('[data-test-facebook-input]', 'blur');

                // regression test: we still have a value after the input is
                // focused and then blurred without any changes
                (0, _chai.expect)(find('[data-test-facebook-input]').val(), 'facebook value after blur with no change').to.equal('https://www.facebook.com/test');

                await testFacebookValidation('facebook.com/username', 'https://www.facebook.com/username');

                await testFacebookValidation('testuser', 'https://www.facebook.com/testuser');

                await testFacebookValidation('ab99', 'https://www.facebook.com/ab99');

                await testFacebookValidation('page/ab99', 'https://www.facebook.com/page/ab99');

                await testFacebookValidation('page/*(&*(%%))', 'https://www.facebook.com/page/*(&*(%%))');

                await testFacebookValidation('facebook.com/pages/some-facebook-page/857469375913?ref=ts', 'https://www.facebook.com/pages/some-facebook-page/857469375913?ref=ts');

                await testFacebookValidation('https://www.facebook.com/groups/savethecrowninn', 'https://www.facebook.com/groups/savethecrowninn');

                await testFacebookValidation('http://github.com/username', 'http://github.com/username', 'The URL must be in a format like https://www.facebook.com/yourPage');

                await testFacebookValidation('http://github.com/pages/username', 'http://github.com/pages/username', 'The URL must be in a format like https://www.facebook.com/yourPage');

                // validates a twitter url correctly

                // loads fixtures and performs transform
                (0, _chai.expect)(find('[data-test-twitter-input]').val(), 'initial twitter value').to.equal('https://twitter.com/test');

                await triggerEvent('[data-test-twitter-input]', 'focus');
                await triggerEvent('[data-test-twitter-input]', 'blur');

                // regression test: we still have a value after the input is
                // focused and then blurred without any changes
                (0, _chai.expect)(find('[data-test-twitter-input]').val(), 'twitter value after blur with no change').to.equal('https://twitter.com/test');

                await testTwitterValidation('twitter.com/username', 'https://twitter.com/username');

                await testTwitterValidation('testuser', 'https://twitter.com/testuser');

                await testTwitterValidation('http://github.com/username', 'https://twitter.com/username');

                await testTwitterValidation('*(&*(%%))', '*(&*(%%))', 'The URL must be in a format like https://twitter.com/yourUsername');

                await testTwitterValidation('thisusernamehasmorethan15characters', 'thisusernamehasmorethan15characters', 'Your Username is not a valid Twitter Username');
            });

            (0, _mocha.it)('warns when leaving without saving', async function () {
                await visit('/settings/general');

                (0, _chai.expect)(find('[data-test-private-checkbox]').prop('checked'), 'private blog checkbox').to.be.false;

                await click('[data-test-toggle-pub-info]');
                await fillIn('[data-test-title-input]', 'New Blog Title');

                await click('[data-test-private-checkbox]');

                (0, _chai.expect)(find('[data-test-private-checkbox]').prop('checked'), 'private blog checkbox').to.be.true;

                await visit('/settings/team');

                (0, _chai.expect)(find('.fullscreen-modal').length, 'modal exists').to.equal(1);

                // Leave without saving
                await (click('.fullscreen-modal [data-test-leave-button]'), 'leave without saving');

                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/team');

                await visit('/settings/general');

                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/general');

                // settings were not saved
                (0, _chai.expect)(find('[data-test-private-checkbox]').prop('checked'), 'private blog checkbox').to.be.false;

                (0, _chai.expect)(find('[data-test-title-input]').text().trim(), 'Blog title').to.equal('');
            });
        });
    });
});
define('ghost-admin/tests/acceptance/settings/labs-test', ['ghost-admin/tests/helpers/destroy-app', 'ghost-admin/tests/helpers/start-app', 'mocha', 'ghost-admin/tests/helpers/ember-simple-auth', 'chai'], function (_destroyApp, _startApp, _mocha, _emberSimpleAuth, _chai) {
    'use strict';

    // import {timeout} from 'ember-concurrency';

    (0, _mocha.describe)('Acceptance: Settings - Labs', function () {
        let application;

        (0, _mocha.beforeEach)(function () {
            application = (0, _startApp.default)();
        });

        (0, _mocha.afterEach)(function () {
            (0, _destroyApp.default)(application);
        });

        (0, _mocha.it)('redirects to signin when not authenticated', async function () {
            (0, _emberSimpleAuth.invalidateSession)(application);
            await visit('/settings/labs');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/signin');
        });

        (0, _mocha.it)('redirects to team page when authenticated as contributor', async function () {
            let role = server.create('role', { name: 'Contributor' });
            server.create('user', { roles: [role], slug: 'test-user' });

            (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/settings/labs');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team/test-user');
        });

        (0, _mocha.it)('redirects to team page when authenticated as author', async function () {
            let role = server.create('role', { name: 'Author' });
            server.create('user', { roles: [role], slug: 'test-user' });

            (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/settings/labs');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team/test-user');
        });

        (0, _mocha.it)('redirects to team page when authenticated as editor', async function () {
            let role = server.create('role', { name: 'Editor' });
            server.create('user', { roles: [role], slug: 'test-user' });

            (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/settings/labs');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team');
        });

        (0, _mocha.describe)('when logged in', function () {
            (0, _mocha.beforeEach)(function () {
                let role = server.create('role', { name: 'Administrator' });
                server.create('user', { roles: [role] });

                return (0, _emberSimpleAuth.authenticateSession)(application);
            });

            _mocha.it.skip('it renders, loads modals correctly', async function () {
                await visit('/settings/labs');

                // has correct url
                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/labs');

                // has correct page title
                (0, _chai.expect)(document.title, 'page title').to.equal('Settings - Labs - Test Blog');

                // highlights nav menu
                (0, _chai.expect)(Ember.$('.gh-nav-settings-labs').hasClass('active'), 'highlights nav menu item').to.be.true;

                await click('#settings-resetdb .js-delete');
                (0, _chai.expect)(find('.fullscreen-modal .modal-content').length, 'modal element').to.equal(1);

                await click('.fullscreen-modal .modal-footer .gh-btn');
                (0, _chai.expect)(find('.fullscreen-modal').length, 'modal element').to.equal(0);
            });

            (0, _mocha.it)('can upload/download redirects', async function () {
                await visit('/settings/labs');

                // successful upload
                server.post('/redirects/json/', {}, 200);

                await fileUpload('[data-test-file-input="redirects"]', ['test'], { name: 'redirects.json', type: 'application/json' });

                // TODO: tests for the temporary success/failure state have been
                // disabled because they were randomly failing

                // this should be half-way through button reset timeout
                // await timeout(50);
                //
                // // shows success button
                // let button = find('[data-test-button="upload-redirects"]');
                // expect(button.length, 'no of success buttons').to.equal(1);
                // expect(
                //     button.hasClass('gh-btn-green'),
                //     'success button is green'
                // ).to.be.true;
                // expect(
                //     button.text().trim(),
                //     'success button text'
                // ).to.have.string('Uploaded');
                //
                // await wait();

                // returned to normal button
                let button = find('[data-test-button="upload-redirects"]');
                (0, _chai.expect)(button.length, 'no of post-success buttons').to.equal(1);
                (0, _chai.expect)(button.hasClass('gh-btn-green'), 'post-success button doesn\'t have success class').to.be.false;
                (0, _chai.expect)(button.text().trim(), 'post-success button text').to.have.string('Upload redirects');

                // failed upload
                server.post('/redirects/json/', {
                    errors: [{
                        errorType: 'BadRequestError',
                        message: 'Test failure message'
                    }]
                }, 400);

                await fileUpload('[data-test-file-input="redirects"]', ['test'], { name: 'redirects-bad.json', type: 'application/json' });

                // TODO: tests for the temporary success/failure state have been
                // disabled because they were randomly failing

                // this should be half-way through button reset timeout
                // await timeout(50);
                //
                // shows failure button
                // button = find('[data-test-button="upload-redirects"]');
                // expect(button.length, 'no of failure buttons').to.equal(1);
                // expect(
                //     button.hasClass('gh-btn-red'),
                //     'failure button is red'
                // ).to.be.true;
                // expect(
                //     button.text().trim(),
                //     'failure button text'
                // ).to.have.string('Upload Failed');
                //
                // await wait();

                // shows error message
                (0, _chai.expect)(find('[data-test-error="redirects"]').text().trim(), 'upload error text').to.have.string('Test failure message');

                // returned to normal button
                button = find('[data-test-button="upload-redirects"]');
                (0, _chai.expect)(button.length, 'no of post-failure buttons').to.equal(1);
                (0, _chai.expect)(button.hasClass('gh-btn-red'), 'post-failure button doesn\'t have failure class').to.be.false;
                (0, _chai.expect)(button.text().trim(), 'post-failure button text').to.have.string('Upload redirects');

                // successful upload clears error
                server.post('/redirects/json/', {}, 200);
                await fileUpload('[data-test-file-input="redirects"]', ['test'], { name: 'redirects-bad.json', type: 'application/json' });

                (0, _chai.expect)(find('[data-test-error="redirects"]')).to.not.exist;

                // can download redirects.json
                await click('[data-test-link="download-redirects"]');

                let iframe = Ember.$('#iframeDownload');
                (0, _chai.expect)(iframe.attr('src')).to.have.string('/redirects/json/');
            });

            (0, _mocha.it)('can upload/download routes.yaml', async function () {
                await visit('/settings/labs');

                // successful upload
                server.post('/settings/routes/yaml/', {}, 200);

                await fileUpload('[data-test-file-input="routes"]', ['test'], { name: 'routes.yaml', type: 'application/x-yaml' });

                // TODO: tests for the temporary success/failure state have been
                // disabled because they were randomly failing

                // this should be half-way through button reset timeout
                // await timeout(50);
                //
                // // shows success button
                // let button = find('[data-test-button="upload-routes"]');
                // expect(button.length, 'no of success buttons').to.equal(1);
                // expect(
                //     button.hasClass('gh-btn-green'),
                //     'success button is green'
                // ).to.be.true;
                // expect(
                //     button.text().trim(),
                //     'success button text'
                // ).to.have.string('Uploaded');
                //
                // await wait();

                // returned to normal button
                let button = find('[data-test-button="upload-routes"]');
                (0, _chai.expect)(button.length, 'no of post-success buttons').to.equal(1);
                (0, _chai.expect)(button.hasClass('gh-btn-green'), 'routes post-success button doesn\'t have success class').to.be.false;
                (0, _chai.expect)(button.text().trim(), 'routes post-success button text').to.have.string('Upload routes YAML');

                // failed upload
                server.post('/settings/routes/yaml/', {
                    errors: [{
                        errorType: 'BadRequestError',
                        message: 'Test failure message'
                    }]
                }, 400);

                await fileUpload('[data-test-file-input="routes"]', ['test'], { name: 'routes-bad.yaml', type: 'application/x-yaml' });

                // TODO: tests for the temporary success/failure state have been
                // disabled because they were randomly failing

                // this should be half-way through button reset timeout
                // await timeout(50);
                //
                // shows failure button
                // button = find('[data-test-button="upload-routes"]');
                // expect(button.length, 'no of failure buttons').to.equal(1);
                // expect(
                //     button.hasClass('gh-btn-red'),
                //     'failure button is red'
                // ).to.be.true;
                // expect(
                //     button.text().trim(),
                //     'failure button text'
                // ).to.have.string('Upload Failed');
                //
                // await wait();

                // shows error message
                (0, _chai.expect)(find('[data-test-error="routes"]').text().trim(), 'routes upload error text').to.have.string('Test failure message');

                // returned to normal button
                button = find('[data-test-button="upload-routes"]');
                (0, _chai.expect)(button.length, 'no of post-failure buttons').to.equal(1);
                (0, _chai.expect)(button.hasClass('gh-btn-red'), 'routes post-failure button doesn\'t have failure class').to.be.false;
                (0, _chai.expect)(button.text().trim(), 'routes post-failure button text').to.have.string('Upload routes YAML');

                // successful upload clears error
                server.post('/settings/routes/yaml/', {}, 200);
                await fileUpload('[data-test-file-input="routes"]', ['test'], { name: 'routes-good.yaml', type: 'application/x-yaml' });

                (0, _chai.expect)(find('[data-test-error="routes"]')).to.not.exist;

                // can download redirects.json
                await click('[data-test-link="download-routes"]');

                let iframe = Ember.$('#iframeDownload');
                (0, _chai.expect)(iframe.attr('src')).to.have.string('/settings/routes/yaml/');
            });
        });
    });
    // import wait from 'ember-test-helpers/wait';
});
define('ghost-admin/tests/acceptance/settings/slack-test', ['ember-cli-mirage', 'ghost-admin/utils/ctrl-or-cmd', 'ghost-admin/tests/helpers/destroy-app', 'ghost-admin/tests/helpers/start-app', 'mocha', 'ghost-admin/tests/helpers/ember-simple-auth', 'chai'], function (_emberCliMirage, _ctrlOrCmd, _destroyApp, _startApp, _mocha, _emberSimpleAuth, _chai) {
    'use strict';

    var _slicedToArray = function () {
        function sliceIterator(arr, i) {
            var _arr = [];
            var _n = true;
            var _d = false;
            var _e = undefined;

            try {
                for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
                    _arr.push(_s.value);

                    if (i && _arr.length === i) break;
                }
            } catch (err) {
                _d = true;
                _e = err;
            } finally {
                try {
                    if (!_n && _i["return"]) _i["return"]();
                } finally {
                    if (_d) throw _e;
                }
            }

            return _arr;
        }

        return function (arr, i) {
            if (Array.isArray(arr)) {
                return arr;
            } else if (Symbol.iterator in Object(arr)) {
                return sliceIterator(arr, i);
            } else {
                throw new TypeError("Invalid attempt to destructure non-iterable instance");
            }
        };
    }();

    (0, _mocha.describe)('Acceptance: Settings - Apps - Slack', function () {
        let application;

        (0, _mocha.beforeEach)(function () {
            application = (0, _startApp.default)();
        });

        (0, _mocha.afterEach)(function () {
            (0, _destroyApp.default)(application);
        });

        (0, _mocha.it)('redirects to signin when not authenticated', async function () {
            (0, _emberSimpleAuth.invalidateSession)(application);
            await visit('/settings/apps/slack');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/signin');
        });

        (0, _mocha.it)('redirects to team page when authenticated as contributor', async function () {
            let role = server.create('role', { name: 'Contributor' });
            server.create('user', { roles: [role], slug: 'test-user' });

            (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/settings/apps/slack');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team/test-user');
        });

        (0, _mocha.it)('redirects to team page when authenticated as author', async function () {
            let role = server.create('role', { name: 'Author' });
            server.create('user', { roles: [role], slug: 'test-user' });

            (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/settings/apps/slack');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team/test-user');
        });

        (0, _mocha.it)('redirects to team page when authenticated as editor', async function () {
            let role = server.create('role', { name: 'Editor' });
            server.create('user', { roles: [role], slug: 'test-user' });

            (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/settings/apps/slack');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team');
        });

        (0, _mocha.describe)('when logged in', function () {
            (0, _mocha.beforeEach)(function () {
                let role = server.create('role', { name: 'Administrator' });
                server.create('user', { roles: [role] });

                return (0, _emberSimpleAuth.authenticateSession)(application);
            });

            (0, _mocha.it)('it validates and saves a slack url properly', async function () {
                await visit('/settings/apps/slack');

                // has correct url
                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/apps/slack');

                await fillIn('[data-test-slack-url-input]', 'notacorrecturl');
                await click('[data-test-save-button]');

                (0, _chai.expect)(find('#slack-settings .error .response').text().trim(), 'inline validation response').to.equal('The URL must be in a format like https://hooks.slack.com/services/<your personal key>');

                // CMD-S shortcut works
                await fillIn('[data-test-slack-url-input]', 'https://hooks.slack.com/services/1275958430');
                await triggerEvent('.gh-app', 'keydown', {
                    keyCode: 83, // s
                    metaKey: _ctrlOrCmd.default === 'command',
                    ctrlKey: _ctrlOrCmd.default === 'ctrl'
                });

                var _server$pretender$han = server.pretender.handledRequests.slice(-1),
                    _server$pretender$han2 = _slicedToArray(_server$pretender$han, 1);

                let newRequest = _server$pretender$han2[0];

                let params = JSON.parse(newRequest.requestBody);

                var _JSON$parse = JSON.parse(params.settings.findBy('key', 'slack').value),
                    _JSON$parse2 = _slicedToArray(_JSON$parse, 1);

                let result = _JSON$parse2[0];


                (0, _chai.expect)(result.url).to.equal('https://hooks.slack.com/services/1275958430');
                (0, _chai.expect)(find('#slack-settings .error .response').text().trim(), 'inline validation response').to.equal('');

                await fillIn('[data-test-slack-url-input]', 'https://hooks.slack.com/services/1275958430');
                await click('[data-test-send-notification-button]');

                (0, _chai.expect)(find('.gh-notification').length, 'number of notifications').to.equal(1);
                (0, _chai.expect)(find('#slack-settings .error .response').text().trim(), 'inline validation response').to.equal('');

                server.put('/settings/', function () {
                    return new _emberCliMirage.default.Response(422, {}, {
                        errors: [{
                            errorType: 'ValidationError',
                            message: 'Test error'
                        }]
                    });
                });

                await click('.gh-notification .gh-notification-close');
                await click('[data-test-send-notification-button]');

                // we shouldn't try to send the test request if the save fails

                var _server$pretender$han3 = server.pretender.handledRequests.slice(-1),
                    _server$pretender$han4 = _slicedToArray(_server$pretender$han3, 1);

                let lastRequest = _server$pretender$han4[0];

                (0, _chai.expect)(lastRequest.url).to.not.match(/\/slack\/test/);
                (0, _chai.expect)(find('.gh-notification').length, 'check slack notification after api validation error').to.equal(0);
            });

            (0, _mocha.it)('warns when leaving without saving', async function () {
                await visit('/settings/apps/slack');

                // has correct url
                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/apps/slack');

                await fillIn('[data-test-slack-url-input]', 'https://hooks.slack.com/services/1275958430');
                await triggerEvent('[data-test-slack-url-input]', 'blur');

                await visit('/settings/design');

                (0, _chai.expect)(find('.fullscreen-modal').length, 'modal exists').to.equal(1);

                // Leave without saving
                await (click('.fullscreen-modal [data-test-leave-button]'), 'leave without saving');

                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/design');

                await visit('/settings/apps/slack');

                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/apps/slack');

                // settings were not saved
                (0, _chai.expect)(find('[data-test-slack-url-input]').text().trim(), 'Slack Webhook URL').to.equal('');
            });
        });
    });
});
define('ghost-admin/tests/acceptance/settings/tags-test', ['ghost-admin/tests/helpers/destroy-app', 'ghost-admin/tests/helpers/start-app', 'ember-test-helpers/wait', 'ghost-admin/utils/window-proxy', 'ember-cli-mirage', 'mocha', 'ghost-admin/tests/helpers/ember-simple-auth', 'ghost-admin/tests/helpers/adapter-error', 'chai', 'ember-concurrency'], function (_destroyApp, _startApp, _wait, _windowProxy, _emberCliMirage, _mocha, _emberSimpleAuth, _adapterError, _chai, _emberConcurrency) {
            'use strict';

            // Grabbed from keymaster's testing code because Ember's `keyEvent` helper
            // is for some reason not triggering the events in a way that keymaster detects:
            // https://github.com/madrobby/keymaster/blob/master/test/keymaster.html#L31
            const modifierMap = {
                        16: 'shiftKey',
                        18: 'altKey',
                        17: 'ctrlKey',
                        91: 'metaKey'
            }; /* eslint-disable camelcase */

            let keydown = function keydown(code, modifiers, el) {
                        let event = document.createEvent('Event');
                        event.initEvent('keydown', true, true);
                        event.keyCode = code;
                        if (modifiers && modifiers.length > 0) {
                                    for (let i in modifiers) {
                                                event[modifierMap[modifiers[i]]] = true;
                                    }
                        }
                        (el || document).dispatchEvent(event);
            };
            let keyup = function keyup(code, el) {
                        let event = document.createEvent('Event');
                        event.initEvent('keyup', true, true);
                        event.keyCode = code;
                        (el || document).dispatchEvent(event);
            };

            (0, _mocha.describe)('Acceptance: Settings - Tags', function () {
                        let application;

                        (0, _mocha.beforeEach)(function () {
                                    application = (0, _startApp.default)();
                        });

                        (0, _mocha.afterEach)(function () {
                                    (0, _destroyApp.default)(application);
                        });

                        (0, _mocha.it)('redirects to signin when not authenticated', async function () {
                                    (0, _emberSimpleAuth.invalidateSession)(application);
                                    await visit('/settings/tags');

                                    (0, _chai.expect)(currentURL()).to.equal('/signin');
                        });

                        (0, _mocha.it)('redirects to team page when authenticated as contributor', async function () {
                                    let role = server.create('role', { name: 'Contributor' });
                                    server.create('user', { roles: [role], slug: 'test-user' });

                                    (0, _emberSimpleAuth.authenticateSession)(application);
                                    await visit('/settings/design');

                                    (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team/test-user');
                        });

                        (0, _mocha.it)('redirects to team page when authenticated as author', async function () {
                                    let role = server.create('role', { name: 'Author' });
                                    server.create('user', { roles: [role], slug: 'test-user' });

                                    (0, _emberSimpleAuth.authenticateSession)(application);
                                    await visit('/settings/design');

                                    (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team/test-user');
                        });

                        (0, _mocha.describe)('when logged in', function () {
                                    let newLocation, originalReplaceState;

                                    (0, _mocha.beforeEach)(function () {
                                                let role = server.create('role', { name: 'Administrator' });
                                                server.create('user', { roles: [role] });

                                                originalReplaceState = _windowProxy.default.replaceState;
                                                _windowProxy.default.replaceState = function (params, title, url) {
                                                            newLocation = url;
                                                };
                                                newLocation = undefined;

                                                return (0, _emberSimpleAuth.authenticateSession)(application);
                                    });

                                    (0, _mocha.afterEach)(function () {
                                                _windowProxy.default.replaceState = originalReplaceState;
                                    });

                                    (0, _mocha.it)('it renders, can be navigated, can edit, create & delete tags', async function () {
                                                let tag1 = server.create('tag');
                                                let tag2 = server.create('tag');

                                                await visit('/settings/tags');

                                                // second wait is needed for the vertical-collection to settle
                                                await (0, _wait.default)();

                                                // it redirects to first tag
                                                (0, _chai.expect)(currentURL(), 'currentURL').to.equal(`/settings/tags/${tag1.slug}`);

                                                // it has correct page title
                                                (0, _chai.expect)(document.title, 'page title').to.equal('Settings - Tags - Test Blog');

                                                // it highlights nav menu
                                                (0, _chai.expect)(Ember.$('.gh-nav-settings-tags').hasClass('active'), 'highlights nav menu item').to.be.true;

                                                // it lists all tags
                                                (0, _chai.expect)(find('.settings-tags .settings-tag').length, 'tag list count').to.equal(2);
                                                (0, _chai.expect)(find('.settings-tags .settings-tag:first .tag-title').text(), 'tag list item title').to.equal(tag1.name);

                                                // it highlights selected tag
                                                (0, _chai.expect)(find(`a[href="/ghost/settings/tags/${tag1.slug}"]`).hasClass('active'), 'highlights selected tag').to.be.true;

                                                // it shows selected tag form
                                                (0, _chai.expect)(find('.tag-settings-pane h4').text(), 'settings pane title').to.equal('Tag Settings');
                                                (0, _chai.expect)(find('.tag-settings-pane input[name="name"]').val(), 'loads correct tag into form').to.equal(tag1.name);

                                                // click the second tag in the list
                                                await click('.tag-edit-button:last');

                                                // it navigates to selected tag
                                                (0, _chai.expect)(currentURL(), 'url after clicking tag').to.equal(`/settings/tags/${tag2.slug}`);

                                                // it highlights selected tag
                                                (0, _chai.expect)(find(`a[href="/ghost/settings/tags/${tag2.slug}"]`).hasClass('active'), 'highlights selected tag').to.be.true;

                                                // it shows selected tag form
                                                (0, _chai.expect)(find('.tag-settings-pane input[name="name"]').val(), 'loads correct tag into form').to.equal(tag2.name);

                                                // simulate up arrow press
                                                Ember.run(() => {
                                                            keydown(38);
                                                            keyup(38);
                                                });

                                                await (0, _wait.default)();

                                                // it navigates to previous tag
                                                (0, _chai.expect)(currentURL(), 'url after keyboard up arrow').to.equal(`/settings/tags/${tag1.slug}`);

                                                // it highlights selected tag
                                                (0, _chai.expect)(find(`a[href="/ghost/settings/tags/${tag1.slug}"]`).hasClass('active'), 'selects previous tag').to.be.true;

                                                // simulate down arrow press
                                                Ember.run(() => {
                                                            keydown(40);
                                                            keyup(40);
                                                });

                                                await (0, _wait.default)();

                                                // it navigates to previous tag
                                                (0, _chai.expect)(currentURL(), 'url after keyboard down arrow').to.equal(`/settings/tags/${tag2.slug}`);

                                                // it highlights selected tag
                                                (0, _chai.expect)(find(`a[href="/ghost/settings/tags/${tag2.slug}"]`).hasClass('active'), 'selects next tag').to.be.true;

                                                // trigger save
                                                await fillIn('.tag-settings-pane input[name="name"]', 'New Name');
                                                await triggerEvent('.tag-settings-pane input[name="name"]', 'blur');

                                                // check we update with the data returned from the server
                                                (0, _chai.expect)(find('.settings-tags .settings-tag:last .tag-title').text(), 'tag list updates on save').to.equal('New Name');
                                                (0, _chai.expect)(find('.tag-settings-pane input[name="name"]').val(), 'settings form updates on save').to.equal('New Name');

                                                // start new tag
                                                await click('.view-actions .gh-btn-green');

                                                // it navigates to the new tag route
                                                (0, _chai.expect)(currentURL(), 'new tag URL').to.equal('/settings/tags/new');

                                                // it displays the new tag form
                                                (0, _chai.expect)(find('.tag-settings-pane h4').text(), 'settings pane title').to.equal('New Tag');

                                                // all fields start blank
                                                find('.tag-settings-pane input, .tag-settings-pane textarea').each(function () {
                                                            (0, _chai.expect)(Ember.$(this).val(), `input field for ${Ember.$(this).attr('name')}`).to.be.empty;
                                                });

                                                // save new tag
                                                await fillIn('.tag-settings-pane input[name="name"]', 'New Tag');
                                                await triggerEvent('.tag-settings-pane input[name="name"]', 'blur');

                                                // extra timeout needed for FF on Linux - sometimes it doesn't update
                                                // quick enough, especially on Travis, and an extra wait() call
                                                // doesn't help
                                                await (0, _emberConcurrency.timeout)(100);

                                                // it redirects to the new tag's URL
                                                (0, _chai.expect)(currentURL(), 'URL after tag creation').to.equal('/settings/tags/new-tag');

                                                // it adds the tag to the list and selects
                                                (0, _chai.expect)(find('.settings-tags .settings-tag').length, 'tag list count after creation').to.equal(3);
                                                (0, _chai.expect)(find('.settings-tags .settings-tag:last .tag-title').text(), 'new tag list item title').to.equal('New Tag');
                                                (0, _chai.expect)(find('a[href="/ghost/settings/tags/new-tag"]').hasClass('active'), 'highlights new tag').to.be.true;

                                                // delete tag
                                                await click('.settings-menu-delete-button');
                                                await click('.fullscreen-modal .gh-btn-red');

                                                // it redirects to the first tag
                                                (0, _chai.expect)(currentURL(), 'URL after tag deletion').to.equal(`/settings/tags/${tag1.slug}`);

                                                // it removes the tag from the list
                                                (0, _chai.expect)(find('.settings-tags .settings-tag').length, 'tag list count after deletion').to.equal(2);
                                    });

                                    // TODO: Unskip and fix
                                    // skipped because it was failing most of the time on Travis
                                    // see https://github.com/TryGhost/Ghost/issues/8805
                                    _mocha.it.skip('loads tag via slug when accessed directly', async function () {
                                                server.createList('tag', 2);

                                                await visit('/settings/tags/tag-1');

                                                // second wait is needed for the vertical-collection to settle
                                                await (0, _wait.default)();

                                                (0, _chai.expect)(currentURL(), 'URL after direct load').to.equal('/settings/tags/tag-1');

                                                // it loads all other tags
                                                (0, _chai.expect)(find('.settings-tags .settings-tag').length, 'tag list count after direct load').to.equal(2);

                                                // selects tag in list
                                                (0, _chai.expect)(find('a[href="/ghost/settings/tags/tag-1"]').hasClass('active'), 'highlights requested tag').to.be.true;

                                                // shows requested tag in settings pane
                                                (0, _chai.expect)(find('.tag-settings-pane input[name="name"]').val(), 'loads correct tag into form').to.equal('Tag 1');
                                    });

                                    (0, _mocha.it)('shows the internal tag label', async function () {
                                                server.create('tag', { name: '#internal-tag', slug: 'hash-internal-tag', visibility: 'internal' });

                                                await visit('settings/tags/');

                                                // second wait is needed for the vertical-collection to settle
                                                await (0, _wait.default)();

                                                (0, _chai.expect)(currentURL()).to.equal('/settings/tags/hash-internal-tag');

                                                (0, _chai.expect)(find('.settings-tags .settings-tag').length, 'tag list count').to.equal(1);

                                                (0, _chai.expect)(find('.settings-tags .settings-tag:first .label.label-blue').length, 'internal tag label').to.equal(1);

                                                (0, _chai.expect)(find('.settings-tags .settings-tag:first .label.label-blue').text().trim(), 'internal tag label text').to.equal('internal');
                                    });

                                    (0, _mocha.it)('updates the URL when slug changes', async function () {
                                                server.createList('tag', 2);

                                                await visit('/settings/tags/tag-1');

                                                // second wait is needed for the vertical-collection to settle
                                                await (0, _wait.default)();

                                                (0, _chai.expect)(currentURL(), 'URL after direct load').to.equal('/settings/tags/tag-1');

                                                // update the slug
                                                await fillIn('.tag-settings-pane input[name="slug"]', 'test');
                                                await triggerEvent('.tag-settings-pane input[name="slug"]', 'blur');

                                                // tests don't have a location.hash so we can only check that the
                                                // slug portion is updated correctly
                                                (0, _chai.expect)(newLocation, 'URL after slug change').to.equal('test');
                                    });

                                    (0, _mocha.it)('redirects to 404 when tag does not exist', async function () {
                                                server.get('/tags/slug/unknown/', function () {
                                                            return new _emberCliMirage.Response(404, { 'Content-Type': 'application/json' }, { errors: [{ message: 'Tag not found.', errorType: 'NotFoundError' }] });
                                                });

                                                (0, _adapterError.errorOverride)();

                                                await visit('settings/tags/unknown');

                                                (0, _adapterError.errorReset)();
                                                (0, _chai.expect)(currentPath()).to.equal('error404');
                                                (0, _chai.expect)(currentURL()).to.equal('/settings/tags/unknown');
                                    });
                        });
            });
});
define('ghost-admin/tests/acceptance/settings/unsplash-test', ['ghost-admin/utils/ctrl-or-cmd', 'ghost-admin/tests/helpers/destroy-app', 'ghost-admin/tests/helpers/start-app', 'mocha', 'ghost-admin/tests/helpers/ember-simple-auth', 'chai'], function (_ctrlOrCmd, _destroyApp, _startApp, _mocha, _emberSimpleAuth, _chai) {
    'use strict';

    var _slicedToArray = function () {
        function sliceIterator(arr, i) {
            var _arr = [];
            var _n = true;
            var _d = false;
            var _e = undefined;

            try {
                for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
                    _arr.push(_s.value);

                    if (i && _arr.length === i) break;
                }
            } catch (err) {
                _d = true;
                _e = err;
            } finally {
                try {
                    if (!_n && _i["return"]) _i["return"]();
                } finally {
                    if (_d) throw _e;
                }
            }

            return _arr;
        }

        return function (arr, i) {
            if (Array.isArray(arr)) {
                return arr;
            } else if (Symbol.iterator in Object(arr)) {
                return sliceIterator(arr, i);
            } else {
                throw new TypeError("Invalid attempt to destructure non-iterable instance");
            }
        };
    }();

    (0, _mocha.describe)('Acceptance: Settings - Apps - Unsplash', function () {
        let application;

        (0, _mocha.beforeEach)(function () {
            application = (0, _startApp.default)();
        });

        (0, _mocha.afterEach)(function () {
            (0, _destroyApp.default)(application);
        });

        (0, _mocha.it)('redirects to signin when not authenticated', async function () {
            (0, _emberSimpleAuth.invalidateSession)(application);
            await visit('/settings/apps/unsplash');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/signin');
        });

        (0, _mocha.it)('redirects to team page when authenticated as contributor', async function () {
            let role = server.create('role', { name: 'Contributor' });
            server.create('user', { roles: [role], slug: 'test-user' });

            (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/settings/apps/unsplash');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team/test-user');
        });

        (0, _mocha.it)('redirects to team page when authenticated as author', async function () {
            let role = server.create('role', { name: 'Author' });
            server.create('user', { roles: [role], slug: 'test-user' });

            (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/settings/apps/unsplash');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team/test-user');
        });

        (0, _mocha.it)('redirects to team page when authenticated as editor', async function () {
            let role = server.create('role', { name: 'Editor' });
            server.create('user', { roles: [role], slug: 'test-user' });

            (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/settings/apps/unsplash');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team');
        });

        (0, _mocha.describe)('when logged in', function () {
            (0, _mocha.beforeEach)(function () {
                let role = server.create('role', { name: 'Administrator' });
                server.create('user', { roles: [role] });

                return (0, _emberSimpleAuth.authenticateSession)(application);
            });

            (0, _mocha.it)('it can activate/deactivate', async function () {
                await visit('/settings/apps/unsplash');

                // has correct url
                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/apps/unsplash');

                // verify we don't have an unsplash setting fixture loaded
                (0, _chai.expect)(server.db.settings.where({ key: 'unsplash' }), 'initial server settings').to.be.empty;

                // it's enabled by default when settings is empty
                (0, _chai.expect)(find('[data-test-checkbox="unsplash"]').prop('checked'), 'checked by default').to.be.true;

                // trigger a save
                await click('[data-test-save-button]');

                // server should now have an unsplash setting

                var _server$db$settings$w = server.db.settings.where({ key: 'unsplash' }),
                    _server$db$settings$w2 = _slicedToArray(_server$db$settings$w, 1);

                let setting = _server$db$settings$w2[0];

                (0, _chai.expect)(setting, 'unsplash setting after save').to.exist;
                (0, _chai.expect)(setting.value).to.equal('{"isActive":true}');

                // disable
                await click(find('[data-test-checkbox="unsplash"]'));

                // save via CMD-S shortcut
                await triggerEvent('.gh-app', 'keydown', {
                    keyCode: 83, // s
                    metaKey: _ctrlOrCmd.default === 'command',
                    ctrlKey: _ctrlOrCmd.default === 'ctrl'
                });

                // server should have an updated setting

                var _server$db$settings$w3 = server.db.settings.where({ key: 'unsplash' });

                var _server$db$settings$w4 = _slicedToArray(_server$db$settings$w3, 1);

                setting = _server$db$settings$w4[0];

                (0, _chai.expect)(setting.value).to.equal('{"isActive":false}');
            });

            (0, _mocha.it)('warns when leaving without saving', async function () {
                await visit('/settings/apps/unsplash');

                // has correct url
                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/apps/unsplash');

                (0, _chai.expect)(find('[data-test-checkbox="unsplash"]').prop('checked'), 'checked by default').to.be.true;

                await click('[data-test-checkbox="unsplash"]');

                (0, _chai.expect)(find('[data-test-checkbox="unsplash"]').prop('checked'), 'Unsplash checkbox').to.be.false;

                await visit('/settings/labs');

                (0, _chai.expect)(find('.fullscreen-modal').length, 'modal exists').to.equal(1);

                // Leave without saving
                await (click('.fullscreen-modal [data-test-leave-button]'), 'leave without saving');

                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/labs');

                await visit('/settings/apps/unsplash');

                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/apps/unsplash');

                // settings were not saved
                (0, _chai.expect)(find('[data-test-checkbox="unsplash"]').prop('checked'), 'Unsplash checkbox').to.be.true;
            });
        });
    });
});
define('ghost-admin/tests/acceptance/setup-test', ['ghost-admin/tests/helpers/destroy-app', 'moment', 'ghost-admin/tests/helpers/start-app', 'ember-cli-mirage', 'mocha', 'ghost-admin/tests/helpers/ember-simple-auth', 'chai'], function (_destroyApp, _moment, _startApp, _emberCliMirage, _mocha, _emberSimpleAuth, _chai) {
    'use strict';

    (0, _mocha.describe)('Acceptance: Setup', function () {
        let application;

        (0, _mocha.beforeEach)(function () {
            application = (0, _startApp.default)();
        });

        (0, _mocha.afterEach)(function () {
            (0, _destroyApp.default)(application);
        });

        (0, _mocha.it)('redirects if already authenticated', async function () {
            let role = server.create('role', { name: 'Author' });
            server.create('user', { roles: [role], slug: 'test-user' });

            await (0, _emberSimpleAuth.authenticateSession)(application);

            await visit('/setup/one');
            (0, _chai.expect)(currentURL()).to.equal('/');

            await visit('/setup/two');
            (0, _chai.expect)(currentURL()).to.equal('/');

            await visit('/setup/three');
            (0, _chai.expect)(currentURL()).to.equal('/');
        });

        (0, _mocha.it)('redirects to signin if already set up', async function () {
            // mimick an already setup blog
            server.get('/authentication/setup/', function () {
                return {
                    setup: [{ status: true }]
                };
            });

            await (0, _emberSimpleAuth.invalidateSession)(application);

            await visit('/setup');
            (0, _chai.expect)(currentURL()).to.equal('/signin');
        });

        (0, _mocha.describe)('with a new blog', function () {
            (0, _mocha.beforeEach)(function () {
                // mimick a new blog
                server.get('/authentication/setup/', function () {
                    return {
                        setup: [{ status: false }]
                    };
                });
            });

            (0, _mocha.it)('has a successful happy path', async function () {
                (0, _emberSimpleAuth.invalidateSession)(application);
                server.loadFixtures('roles');

                await visit('/setup');

                // it redirects to step one
                (0, _chai.expect)(currentURL(), 'url after accessing /setup').to.equal('/setup/one');

                // it highlights first step
                (0, _chai.expect)(find('.gh-flow-nav .step:first-of-type').hasClass('active')).to.be.true;
                (0, _chai.expect)(find('.gh-flow-nav .step:nth-of-type(2)').hasClass('active')).to.be.false;
                (0, _chai.expect)(find('.gh-flow-nav .step:nth-of-type(3)').hasClass('active')).to.be.false;

                // it displays download count (count increments for each ajax call
                // and polling is disabled in testing so our count should be "1"
                (0, _chai.expect)(find('.gh-flow-content em').text().trim()).to.equal('1');

                await click('.gh-btn-green');

                // it transitions to step two
                (0, _chai.expect)(currentURL(), 'url after clicking "Create your account"').to.equal('/setup/two');

                // email field is focused by default
                // NOTE: $('x').is(':focus') doesn't work in phantomjs CLI runner
                // https://github.com/ariya/phantomjs/issues/10427
                (0, _chai.expect)(find('[data-test-blog-title-input]').get(0) === document.activeElement, 'blog title has focus').to.be.true;

                await click('.gh-btn-green');

                // it marks fields as invalid
                (0, _chai.expect)(find('.form-group.error').length, 'number of invalid fields').to.equal(4);

                // it displays error messages
                (0, _chai.expect)(find('.error .response').length, 'number of in-line validation messages').to.equal(4);

                // it displays main error
                (0, _chai.expect)(find('.main-error').length, 'main error is displayed').to.equal(1);

                // enter valid details and submit
                await fillIn('[data-test-email-input]', 'test@example.com');
                await fillIn('[data-test-name-input]', 'Test User');
                await fillIn('[data-test-password-input]', 'thisissupersafe');
                await fillIn('[data-test-blog-title-input]', 'Blog Title');
                await click('.gh-btn-green');

                // it transitions to step 3
                (0, _chai.expect)(currentURL(), 'url after submitting step two').to.equal('/setup/three');

                // submit button is "disabled"
                (0, _chai.expect)(find('button[type="submit"]').hasClass('gh-btn-green'), 'invite button with no emails is white').to.be.false;

                // fill in a valid email
                await fillIn('[name="users"]', 'new-user@example.com');

                // submit button is "enabled"
                (0, _chai.expect)(find('button[type="submit"]').hasClass('gh-btn-green'), 'invite button is green with valid email address').to.be.true;

                // submit the invite form
                await click('button[type="submit"]');

                // it redirects to the home / "content" screen
                (0, _chai.expect)(currentURL(), 'url after submitting invites').to.equal('/');

                // it displays success alert
                (0, _chai.expect)(find('.gh-alert-green').length, 'number of success alerts').to.equal(1);
            });

            (0, _mocha.it)('handles validation errors in step 2', async function () {
                let postCount = 0;

                (0, _emberSimpleAuth.invalidateSession)(application);
                server.loadFixtures('roles');

                server.post('/authentication/setup', function () {
                    postCount += 1;

                    // validation error
                    if (postCount === 1) {
                        return new _emberCliMirage.Response(422, {}, {
                            errors: [{
                                errorType: 'ValidationError',
                                message: 'Server response message'
                            }]
                        });
                    }

                    // server error
                    if (postCount === 2) {
                        return new _emberCliMirage.Response(500, {}, null);
                    }
                });

                await visit('/setup/two');
                await click('.gh-btn-green');

                // non-server validation
                (0, _chai.expect)(find('.main-error').text().trim(), 'error text').to.not.be.empty;

                await fillIn('[data-test-email-input]', 'test@example.com');
                await fillIn('[data-test-name-input]', 'Test User');
                await fillIn('[data-test-password-input]', 'thisissupersafe');
                await fillIn('[data-test-blog-title-input]', 'Blog Title');

                // first post - simulated validation error
                await click('.gh-btn-green');

                (0, _chai.expect)(find('.main-error').text().trim(), 'error text').to.equal('Server response message');

                // second post - simulated server error
                await click('.gh-btn-green');

                (0, _chai.expect)(find('.main-error').text().trim(), 'error text').to.be.empty;

                (0, _chai.expect)(find('.gh-alert-red').length, 'number of alerts').to.equal(1);
            });

            (0, _mocha.it)('handles invalid origin error on step 2', async function () {
                // mimick the API response for an invalid origin
                server.post('/authentication/token', function () {
                    return new _emberCliMirage.Response(401, {}, {
                        errors: [{
                            errorType: 'UnauthorizedError',
                            message: 'Access Denied from url: unknown.com. Please use the url configured in config.js.'
                        }]
                    });
                });

                (0, _emberSimpleAuth.invalidateSession)(application);
                server.loadFixtures('roles');

                await visit('/setup/two');
                await fillIn('[data-test-email-input]', 'test@example.com');
                await fillIn('[data-test-name-input]', 'Test User');
                await fillIn('[data-test-password-input]', 'thisissupersafe');
                await fillIn('[data-test-blog-title-input]', 'Blog Title');
                await click('.gh-btn-green');

                // button should not be spinning
                (0, _chai.expect)(find('.gh-btn-green .spinner').length, 'button has spinner').to.equal(0);
                // we should show an error message
                (0, _chai.expect)(find('.main-error').text(), 'error text').to.have.string('Access Denied from url: unknown.com. Please use the url configured in config.js.');
            });

            (0, _mocha.it)('handles validation errors in step 3', async function () {
                let input = '[name="users"]';
                let postCount = 0;
                let button, formGroup;

                (0, _emberSimpleAuth.invalidateSession)(application);
                server.loadFixtures('roles');

                server.post('/invites/', function ({ invites }) {
                    let attrs = this.normalizedRequestAttrs();

                    postCount += 1;

                    // invalid
                    if (postCount === 1) {
                        return new _emberCliMirage.Response(422, {}, {
                            errors: [{
                                errorType: 'ValidationError',
                                message: 'Dummy validation error'
                            }]
                        });
                    }

                    // TODO: duplicated from mirage/config/invites - extract method?
                    attrs.token = `${invites.all().models.length}-token`;
                    attrs.expires = _moment.default.utc().add(1, 'day').valueOf();
                    attrs.createdAt = _moment.default.utc().format();
                    attrs.createdBy = 1;
                    attrs.updatedAt = _moment.default.utc().format();
                    attrs.updatedBy = 1;
                    attrs.status = 'sent';

                    return invites.create(attrs);
                });

                // complete step 2 so we can access step 3
                await visit('/setup/two');
                await fillIn('[data-test-email-input]', 'test@example.com');
                await fillIn('[data-test-name-input]', 'Test User');
                await fillIn('[data-test-password-input]', 'thisissupersafe');
                await fillIn('[data-test-blog-title-input]', 'Blog Title');
                await click('.gh-btn-green');

                // default field/button state
                formGroup = find('.gh-flow-invite .form-group');
                button = find('.gh-flow-invite button[type="submit"]');

                (0, _chai.expect)(formGroup.hasClass('error'), 'default field has error class').to.be.false;

                (0, _chai.expect)(button.text().trim(), 'default button text').to.equal('Invite some users');

                (0, _chai.expect)(button.hasClass('gh-btn-minor'), 'default button is disabled').to.be.true;

                // no users submitted state
                await click('.gh-flow-invite button[type="submit"]');

                (0, _chai.expect)(formGroup.hasClass('error'), 'no users submitted field has error class').to.be.true;

                (0, _chai.expect)(button.text().trim(), 'no users submitted button text').to.equal('No users to invite');

                (0, _chai.expect)(button.hasClass('gh-btn-minor'), 'no users submitted button is disabled').to.be.true;

                // single invalid email
                await fillIn(input, 'invalid email');
                await triggerEvent(input, 'blur');

                (0, _chai.expect)(formGroup.hasClass('error'), 'invalid field has error class').to.be.true;

                (0, _chai.expect)(button.text().trim(), 'single invalid button text').to.equal('1 invalid email address');

                (0, _chai.expect)(button.hasClass('gh-btn-minor'), 'invalid email button is disabled').to.be.true;

                // multiple invalid emails
                await fillIn(input, 'invalid email\nanother invalid address');
                await triggerEvent(input, 'blur');

                (0, _chai.expect)(button.text().trim(), 'multiple invalid button text').to.equal('2 invalid email addresses');

                // single valid email
                await fillIn(input, 'invited@example.com');
                await triggerEvent(input, 'blur');

                (0, _chai.expect)(formGroup.hasClass('error'), 'valid field has error class').to.be.false;

                (0, _chai.expect)(button.text().trim(), 'single valid button text').to.equal('Invite 1 user');

                (0, _chai.expect)(button.hasClass('gh-btn-green'), 'valid email button is enabled').to.be.true;

                // multiple valid emails
                await fillIn(input, 'invited1@example.com\ninvited2@example.com');
                await triggerEvent(input, 'blur');

                (0, _chai.expect)(button.text().trim(), 'multiple valid button text').to.equal('Invite 2 users');

                // submit invitations with simulated failure on 1 invite
                await click('.gh-btn-green');

                // it redirects to the home / "content" screen
                (0, _chai.expect)(currentURL(), 'url after submitting invites').to.equal('/');

                // it displays success alert
                (0, _chai.expect)(find('.gh-alert-green').length, 'number of success alerts').to.equal(1);

                // it displays failure alert
                (0, _chai.expect)(find('.gh-alert-red').length, 'number of failure alerts').to.equal(1);
            });
        });
    });
});
define('ghost-admin/tests/acceptance/signin-test', ['npm:deparam', 'ghost-admin/tests/helpers/destroy-app', 'ghost-admin/tests/helpers/start-app', 'ember-cli-mirage', 'mocha', 'ghost-admin/tests/helpers/ember-simple-auth', 'chai'], function (_npmDeparam, _destroyApp, _startApp, _emberCliMirage, _mocha, _emberSimpleAuth, _chai) {
    'use strict';

    (0, _mocha.describe)('Acceptance: Signin', function () {
        let application;

        (0, _mocha.beforeEach)(function () {
            application = (0, _startApp.default)();
        });

        (0, _mocha.afterEach)(function () {
            (0, _destroyApp.default)(application);
        });

        (0, _mocha.it)('redirects if already authenticated', async function () {
            let role = server.create('role', { name: 'Author' });
            server.create('user', { roles: [role], slug: 'test-user' });

            await (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/signin');

            (0, _chai.expect)(currentURL(), 'current url').to.equal('/');
        });

        (0, _mocha.describe)('when attempting to signin', function () {
            (0, _mocha.beforeEach)(function () {
                let role = server.create('role', { name: 'Administrator' });
                server.create('user', { roles: [role], slug: 'test-user' });

                server.post('/authentication/token', function (schema, { requestBody }) {
                    var _deparam = (0, _npmDeparam.default)(requestBody);

                    let grantType = _deparam.grant_type,
                        username = _deparam.username,
                        password = _deparam.password,
                        clientId = _deparam.client_id;


                    (0, _chai.expect)(grantType, 'grant type').to.equal('password');
                    (0, _chai.expect)(username, 'username').to.equal('test@example.com');
                    (0, _chai.expect)(clientId, 'client id').to.equal('ghost-admin');

                    if (password === 'thisissupersafe') {
                        return {
                            access_token: 'MirageAccessToken',
                            expires_in: 3600,
                            refresh_token: 'MirageRefreshToken',
                            token_type: 'Bearer'
                        };
                    } else {
                        return new _emberCliMirage.Response(401, {}, {
                            errors: [{
                                errorType: 'UnauthorizedError',
                                message: 'Invalid Password'
                            }]
                        });
                    }
                    /* eslint-enable camelcase */
                });
            });

            (0, _mocha.it)('errors correctly', async function () {
                await (0, _emberSimpleAuth.invalidateSession)(application);
                await visit('/signin');

                (0, _chai.expect)(currentURL(), 'signin url').to.equal('/signin');

                (0, _chai.expect)(find('input[name="identification"]').length, 'email input field').to.equal(1);
                (0, _chai.expect)(find('input[name="password"]').length, 'password input field').to.equal(1);

                await click('.gh-btn-blue');

                (0, _chai.expect)(find('.form-group.error').length, 'number of invalid fields').to.equal(2);

                (0, _chai.expect)(find('.main-error').length, 'main error is displayed').to.equal(1);

                await fillIn('[name="identification"]', 'test@example.com');
                await fillIn('[name="password"]', 'invalid');
                await click('.gh-btn-blue');

                (0, _chai.expect)(currentURL(), 'current url').to.equal('/signin');

                (0, _chai.expect)(find('.main-error').length, 'main error is displayed').to.equal(1);

                (0, _chai.expect)(find('.main-error').text().trim(), 'main error text').to.equal('Invalid Password');
            });

            (0, _mocha.it)('submits successfully', async function () {
                (0, _emberSimpleAuth.invalidateSession)(application);

                await visit('/signin');
                (0, _chai.expect)(currentURL(), 'current url').to.equal('/signin');

                await fillIn('[name="identification"]', 'test@example.com');
                await fillIn('[name="password"]', 'thisissupersafe');
                await click('.gh-btn-blue');
                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/');
            });
        });
    });
});
define('ghost-admin/tests/acceptance/signup-test', ['ghost-admin/tests/helpers/destroy-app', 'ghost-admin/tests/helpers/start-app', 'mocha', 'chai'], function (_destroyApp, _startApp, _mocha, _chai) {
    'use strict';

    (0, _mocha.describe)('Acceptance: Signup', function () {
        let application;

        (0, _mocha.beforeEach)(function () {
            application = (0, _startApp.default)();
        });

        (0, _mocha.afterEach)(function () {
            (0, _destroyApp.default)(application);
        });

        (0, _mocha.it)('can signup successfully', async function () {
            server.get('/authentication/invitation', function () {
                return {
                    invitation: [{ valid: true }]
                };
            });

            server.post('/authentication/invitation/', function ({ users }, { requestBody }) {
                let params = JSON.parse(requestBody);
                (0, _chai.expect)(params.invitation[0].name).to.equal('Test User');
                (0, _chai.expect)(params.invitation[0].email).to.equal('kevin+test2@ghost.org');
                (0, _chai.expect)(params.invitation[0].password).to.equal('thisissupersafe');
                (0, _chai.expect)(params.invitation[0].token).to.equal('MTQ3MDM0NjAxNzkyOXxrZXZpbit0ZXN0MkBnaG9zdC5vcmd8MmNEblFjM2c3ZlFUajluTks0aUdQU0dmdm9ta0xkWGY2OEZ1V2dTNjZVZz0');

                // ensure that `/users/me/` request returns a user
                let role = server.create('role', { name: 'Author' });
                users.create({ email: 'kevin@test2@ghost.org', roles: [role] });

                return {
                    invitation: [{
                        message: 'Invitation accepted.'
                    }]
                };
            });

            // token details:
            // "1470346017929|kevin+test2@ghost.org|2cDnQc3g7fQTj9nNK4iGPSGfvomkLdXf68FuWgS66Ug="
            await visit('/signup/MTQ3MDM0NjAxNzkyOXxrZXZpbit0ZXN0MkBnaG9zdC5vcmd8MmNEblFjM2c3ZlFUajluTks0aUdQU0dmdm9ta0xkWGY2OEZ1V2dTNjZVZz0');

            (0, _chai.expect)(currentPath()).to.equal('signup');

            // email address should be pre-filled and disabled
            (0, _chai.expect)(find('input[name="email"]').val(), 'email field value').to.equal('kevin+test2@ghost.org');

            (0, _chai.expect)(find('input[name="email"]').is(':disabled'), 'email field is disabled').to.be.true;

            // focus out in Name field triggers inline error
            await triggerEvent('input[name="name"]', 'blur');

            (0, _chai.expect)(find('input[name="name"]').closest('.form-group').hasClass('error'), 'name field group has error class when empty').to.be.true;

            (0, _chai.expect)(find('input[name="name"]').closest('.form-group').find('.response').text().trim(), 'name inline-error text').to.match(/Please enter a name/);

            // entering text in Name field clears error
            await fillIn('input[name="name"]', 'Test User');
            await triggerEvent('input[name="name"]', 'blur');

            (0, _chai.expect)(find('input[name="name"]').closest('.form-group').hasClass('error'), 'name field loses error class after text input').to.be.false;

            (0, _chai.expect)(find('input[name="name"]').closest('.form-group').find('.response').text().trim(), 'name field error is removed after text input').to.equal('');

            // check password validation
            // focus out in password field triggers inline error
            // no password
            await triggerEvent('input[name="password"]', 'blur');

            (0, _chai.expect)(find('input[name="password"]').closest('.form-group').hasClass('error'), 'password field group has error class when empty').to.be.true;

            (0, _chai.expect)(find('input[name="password"]').closest('.form-group').find('.response').text().trim(), 'password field error text').to.match(/must be at least 10 characters/);

            // password too short
            await fillIn('input[name="password"]', 'short');
            await triggerEvent('input[name="password"]', 'blur');

            (0, _chai.expect)(find('input[name="password"]').closest('.form-group').find('.response').text().trim(), 'password field error text').to.match(/must be at least 10 characters/);

            // password must not be a bad password
            await fillIn('input[name="password"]', '1234567890');
            await triggerEvent('input[name="password"]', 'blur');

            (0, _chai.expect)(find('input[name="password"]').closest('.form-group').find('.response').text().trim(), 'password field error text').to.match(/you cannot use an insecure password/);

            // password must not be a disallowed password
            await fillIn('input[name="password"]', 'password99');
            await triggerEvent('input[name="password"]', 'blur');

            (0, _chai.expect)(find('input[name="password"]').closest('.form-group').find('.response').text().trim(), 'password field error text').to.match(/you cannot use an insecure password/);

            // password must not have repeating characters
            await fillIn('input[name="password"]', '2222222222');
            await triggerEvent('input[name="password"]', 'blur');

            (0, _chai.expect)(find('input[name="password"]').closest('.form-group').find('.response').text().trim(), 'password field error text').to.match(/you cannot use an insecure password/);

            // entering valid text in Password field clears error
            await fillIn('input[name="password"]', 'thisissupersafe');
            await triggerEvent('input[name="password"]', 'blur');

            (0, _chai.expect)(find('input[name="password"]').closest('.form-group').hasClass('error'), 'password field loses error class after text input').to.be.false;

            (0, _chai.expect)(find('input[name="password"]').closest('.form-group').find('.response').text().trim(), 'password field error is removed after text input').to.equal('');

            // submitting sends correct details and redirects to content screen
            await click('.gh-btn-green');

            (0, _chai.expect)(currentPath()).to.equal('posts.index');
        });

        (0, _mocha.it)('redirects if already logged in');
        (0, _mocha.it)('redirects with alert on invalid token');
        (0, _mocha.it)('redirects with alert on non-existant or expired token');
    });
});
define('ghost-admin/tests/acceptance/subscribers-test', ['ghost-admin/tests/helpers/destroy-app', 'ghost-admin/tests/helpers/start-app', 'mocha', 'ghost-admin/tests/helpers/ember-simple-auth', 'chai'], function (_destroyApp, _startApp, _mocha, _emberSimpleAuth, _chai) {
            'use strict';

            var _slicedToArray = function () {
                        function sliceIterator(arr, i) {
                                    var _arr = [];
                                    var _n = true;
                                    var _d = false;
                                    var _e = undefined;

                                    try {
                                                for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
                                                            _arr.push(_s.value);

                                                            if (i && _arr.length === i) break;
                                                }
                                    } catch (err) {
                                                _d = true;
                                                _e = err;
                                    } finally {
                                                try {
                                                            if (!_n && _i["return"]) _i["return"]();
                                                } finally {
                                                            if (_d) throw _e;
                                                }
                                    }

                                    return _arr;
                        }

                        return function (arr, i) {
                                    if (Array.isArray(arr)) {
                                                return arr;
                                    } else if (Symbol.iterator in Object(arr)) {
                                                return sliceIterator(arr, i);
                                    } else {
                                                throw new TypeError("Invalid attempt to destructure non-iterable instance");
                                    }
                        };
            }();

            (0, _mocha.describe)('Acceptance: Subscribers', function () {
                        let application;

                        (0, _mocha.beforeEach)(function () {
                                    application = (0, _startApp.default)();
                        });

                        (0, _mocha.afterEach)(function () {
                                    (0, _destroyApp.default)(application);
                        });

                        (0, _mocha.it)('redirects to signin when not authenticated', async function () {
                                    (0, _emberSimpleAuth.invalidateSession)(application);
                                    await visit('/subscribers');

                                    (0, _chai.expect)(currentURL()).to.equal('/signin');
                        });

                        (0, _mocha.it)('redirects editors to posts', async function () {
                                    let role = server.create('role', { name: 'Editor' });
                                    server.create('user', { roles: [role] });

                                    (0, _emberSimpleAuth.authenticateSession)(application);
                                    await visit('/subscribers');

                                    (0, _chai.expect)(currentURL()).to.equal('/');
                                    (0, _chai.expect)(find('.gh-nav-main a:contains("Subscribers")').length, 'sidebar link is visible').to.equal(0);
                        });

                        (0, _mocha.it)('redirects authors to posts', async function () {
                                    let role = server.create('role', { name: 'Author' });
                                    server.create('user', { roles: [role] });

                                    (0, _emberSimpleAuth.authenticateSession)(application);
                                    await visit('/subscribers');

                                    (0, _chai.expect)(currentURL()).to.equal('/');
                                    (0, _chai.expect)(find('.gh-nav-main a:contains("Subscribers")').length, 'sidebar link is visible').to.equal(0);
                        });

                        (0, _mocha.it)('redirects contributors to posts', async function () {
                                    let role = server.create('role', { name: 'Contributor' });
                                    server.create('user', { roles: [role] });

                                    (0, _emberSimpleAuth.authenticateSession)(application);
                                    await visit('/subscribers');

                                    (0, _chai.expect)(currentURL()).to.equal('/');
                                    (0, _chai.expect)(find('.gh-nav-main a:contains("Subscribers")').length, 'sidebar link is visible').to.equal(0);
                        });

                        (0, _mocha.describe)('an admin', function () {
                                    (0, _mocha.beforeEach)(function () {
                                                let role = server.create('role', { name: 'Administrator' });
                                                server.create('user', { roles: [role] });

                                                return (0, _emberSimpleAuth.authenticateSession)(application);
                                    });

                                    (0, _mocha.it)('can manage subscribers', async function () {
                                                server.createList('subscriber', 40);

                                                await visit('/');
                                                await click('.gh-nav-main a:contains("Subscribers")');

                                                // it navigates to the correct page
                                                (0, _chai.expect)(currentPath()).to.equal('subscribers.index');

                                                // it has correct page title
                                                (0, _chai.expect)(document.title, 'page title').to.equal('Subscribers - Test Blog');

                                                // it loads the first page
                                                // TODO: latest ember-in-viewport causes infinite scroll issues with
                                                // FF here where it loads two pages straight away so we need to check
                                                // if rows are greater than or equal to a single page
                                                (0, _chai.expect)(find('.subscribers-table .lt-body .lt-row').length, 'number of subscriber rows').to.be.at.least(30);

                                                // it shows the total number of subscribers
                                                (0, _chai.expect)(find('[data-test-total-subscribers]').text().trim(), 'displayed subscribers total').to.equal('(40)');

                                                // it defaults to sorting by created_at desc

                                                var _server$pretender$han = server.pretender.handledRequests.slice(-1),
                                                    _server$pretender$han2 = _slicedToArray(_server$pretender$han, 1);

                                                let lastRequest = _server$pretender$han2[0];

                                                (0, _chai.expect)(lastRequest.queryParams.order).to.equal('created_at desc');

                                                let createdAtHeader = find('.subscribers-table th:contains("Subscription Date")');
                                                (0, _chai.expect)(createdAtHeader.hasClass('is-sorted'), 'createdAt column is sorted').to.be.true;
                                                (0, _chai.expect)(createdAtHeader.find('.gh-icon-descending').length, 'createdAt column has descending icon').to.equal(1);

                                                // click the column to re-order
                                                await click('th:contains("Subscription Date")');

                                                // it flips the directions and re-fetches

                                                var _server$pretender$han3 = server.pretender.handledRequests.slice(-1);

                                                var _server$pretender$han4 = _slicedToArray(_server$pretender$han3, 1);

                                                lastRequest = _server$pretender$han4[0];

                                                (0, _chai.expect)(lastRequest.queryParams.order).to.equal('created_at asc');

                                                createdAtHeader = find('.subscribers-table th:contains("Subscription Date")');
                                                (0, _chai.expect)(createdAtHeader.find('.gh-icon-ascending').length, 'createdAt column has ascending icon').to.equal(1);

                                                // TODO: scroll test disabled as ember-light-table doesn't calculate
                                                // the scroll trigger element's positioning against the scroll
                                                // container - https://github.com/offirgolan/ember-light-table/issues/201
                                                //
                                                // // scroll to the bottom of the table to simulate infinite scroll
                                                // await find('.subscribers-table').scrollTop(find('.subscribers-table .ember-light-table').height() - 50);
                                                //
                                                // // trigger infinite scroll
                                                // await triggerEvent('.subscribers-table tbody', 'scroll');
                                                //
                                                // // it loads the next page
                                                // expect(find('.subscribers-table .lt-body .lt-row').length, 'number of subscriber rows after infinite-scroll')
                                                //     .to.equal(40);

                                                // click the add subscriber button
                                                await click('.gh-btn:contains("Add Subscriber")');

                                                // it displays the add subscriber modal
                                                (0, _chai.expect)(find('.fullscreen-modal').length, 'add subscriber modal displayed').to.equal(1);

                                                // cancel the modal
                                                await click('.fullscreen-modal .gh-btn:contains("Cancel")');

                                                // it closes the add subscriber modal
                                                (0, _chai.expect)(find('.fullscreen-modal').length, 'add subscriber modal displayed after cancel').to.equal(0);

                                                // save a new subscriber
                                                await click('.gh-btn:contains("Add Subscriber")');
                                                await fillIn('.fullscreen-modal input[name="email"]', 'test@example.com');
                                                await click('.fullscreen-modal .gh-btn:contains("Add")');

                                                // the add subscriber modal is closed
                                                (0, _chai.expect)(find('.fullscreen-modal').length, 'add subscriber modal displayed after save').to.equal(0);

                                                // the subscriber is added to the table
                                                (0, _chai.expect)(find('.subscribers-table .lt-body .lt-row:first-of-type .lt-cell:first-of-type').text().trim(), 'first email in list after addition').to.equal('test@example.com');

                                                // the table is scrolled to the top
                                                // TODO: implement scroll to new record after addition
                                                // expect(find('.subscribers-table').scrollTop(), 'scroll position after addition')
                                                //     .to.equal(0);

                                                // the subscriber total is updated
                                                (0, _chai.expect)(find('[data-test-total-subscribers]').text().trim(), 'subscribers total after addition').to.equal('(41)');

                                                // saving a duplicate subscriber
                                                await click('.gh-btn:contains("Add Subscriber")');
                                                await fillIn('.fullscreen-modal input[name="email"]', 'test@example.com');
                                                await click('.fullscreen-modal .gh-btn:contains("Add")');

                                                // the validation error is displayed
                                                (0, _chai.expect)(find('.fullscreen-modal .error .response').text().trim(), 'duplicate email validation').to.equal('Email already exists.');

                                                // the subscriber is not added to the table
                                                (0, _chai.expect)(find('.lt-cell:contains(test@example.com)').length, 'number of "test@example.com rows"').to.equal(1);

                                                // the subscriber total is unchanged
                                                (0, _chai.expect)(find('[data-test-total-subscribers]').text().trim(), 'subscribers total after failed add').to.equal('(41)');

                                                // deleting a subscriber
                                                await click('.fullscreen-modal .gh-btn:contains("Cancel")');
                                                await click('.subscribers-table tbody tr:first-of-type button:last-of-type');

                                                // it displays the delete subscriber modal
                                                (0, _chai.expect)(find('.fullscreen-modal').length, 'delete subscriber modal displayed').to.equal(1);

                                                // cancel the modal
                                                await click('.fullscreen-modal .gh-btn:contains("Cancel")');

                                                // it closes the add subscriber modal
                                                (0, _chai.expect)(find('.fullscreen-modal').length, 'delete subscriber modal displayed after cancel').to.equal(0);

                                                await click('.subscribers-table tbody tr:first-of-type button:last-of-type');
                                                await click('.fullscreen-modal .gh-btn:contains("Delete")');

                                                // the add subscriber modal is closed
                                                (0, _chai.expect)(find('.fullscreen-modal').length, 'delete subscriber modal displayed after confirm').to.equal(0);

                                                // the subscriber is removed from the table
                                                (0, _chai.expect)(find('.subscribers-table .lt-body .lt-row:first-of-type .lt-cell:first-of-type').text().trim(), 'first email in list after addition').to.not.equal('test@example.com');

                                                // the subscriber total is updated
                                                (0, _chai.expect)(find('[data-test-total-subscribers]').text().trim(), 'subscribers total after addition').to.equal('(40)');

                                                // click the import subscribers button
                                                await click('.gh-btn:contains("Import CSV")');

                                                // it displays the import subscribers modal
                                                (0, _chai.expect)(find('.fullscreen-modal').length, 'import subscribers modal displayed').to.equal(1);
                                                (0, _chai.expect)(find('.fullscreen-modal input[type="file"]').length, 'import modal contains file input').to.equal(1);

                                                // cancel the modal
                                                await click('.fullscreen-modal .gh-btn:contains("Cancel")');

                                                // it closes the import subscribers modal
                                                (0, _chai.expect)(find('.fullscreen-modal').length, 'import subscribers modal displayed after cancel').to.equal(0);

                                                await click('.gh-btn:contains("Import CSV")');
                                                await fileUpload('.fullscreen-modal input[type="file"]', ['test'], { name: 'test.csv' });

                                                // modal title changes
                                                (0, _chai.expect)(find('.fullscreen-modal h1').text().trim(), 'import modal title after import').to.equal('Import Successful');

                                                // modal button changes
                                                (0, _chai.expect)(find('.fullscreen-modal .modal-footer button').text().trim(), 'import modal button text after import').to.equal('Close');

                                                // subscriber total is updated
                                                (0, _chai.expect)(find('[data-test-total-subscribers]').text().trim(), 'subscribers total after import').to.equal('(90)');

                                                // TODO: re-enable once bug in ember-light-table that triggers second page load is fixed
                                                // table is reset
                                                // [lastRequest] = server.pretender.handledRequests.slice(-1);
                                                // expect(lastRequest.url, 'endpoint requested after import')
                                                //     .to.match(/\/subscribers\/\?/);
                                                // expect(lastRequest.queryParams.page, 'page requested after import')
                                                //     .to.equal('1');

                                                // expect(find('.subscribers-table .lt-body .lt-row').length, 'number of rows in table after import')
                                                //     .to.equal(30);

                                                // close modal
                                    });
                        });
            });
});
define('ghost-admin/tests/acceptance/team-test', ['ghost-admin/utils/ctrl-or-cmd', 'ghost-admin/tests/helpers/destroy-app', 'moment', 'ghost-admin/tests/helpers/start-app', 'ghost-admin/utils/window-proxy', 'ember-cli-mirage', 'mocha', 'ghost-admin/tests/helpers/ember-simple-auth', 'ghost-admin/tests/helpers/adapter-error', 'chai'], function (_ctrlOrCmd, _destroyApp, _moment, _startApp, _windowProxy, _emberCliMirage, _mocha, _emberSimpleAuth, _adapterError, _chai) {
    'use strict';

    var _slicedToArray = function () {
        function sliceIterator(arr, i) {
            var _arr = [];
            var _n = true;
            var _d = false;
            var _e = undefined;

            try {
                for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
                    _arr.push(_s.value);

                    if (i && _arr.length === i) break;
                }
            } catch (err) {
                _d = true;
                _e = err;
            } finally {
                try {
                    if (!_n && _i["return"]) _i["return"]();
                } finally {
                    if (_d) throw _e;
                }
            }

            return _arr;
        }

        return function (arr, i) {
            if (Array.isArray(arr)) {
                return arr;
            } else if (Symbol.iterator in Object(arr)) {
                return sliceIterator(arr, i);
            } else {
                throw new TypeError("Invalid attempt to destructure non-iterable instance");
            }
        };
    }();

    (0, _mocha.describe)('Acceptance: Team', function () {
        let application;

        (0, _mocha.beforeEach)(function () {
            application = (0, _startApp.default)();
        });

        (0, _mocha.afterEach)(function () {
            (0, _destroyApp.default)(application);
        });

        (0, _mocha.it)('redirects to signin when not authenticated', async function () {
            (0, _emberSimpleAuth.invalidateSession)(application);
            await visit('/team');

            (0, _chai.expect)(currentURL()).to.equal('/signin');
        });

        (0, _mocha.it)('redirects correctly when authenticated as contributor', async function () {
            let role = server.create('role', { name: 'Contributor' });
            server.create('user', { roles: [role], slug: 'test-user' });

            server.create('user', { slug: 'no-access' });

            (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/team/no-access');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team/test-user');
        });

        (0, _mocha.it)('redirects correctly when authenticated as author', async function () {
            let role = server.create('role', { name: 'Author' });
            server.create('user', { roles: [role], slug: 'test-user' });

            server.create('user', { slug: 'no-access' });

            (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/team/no-access');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team/test-user');
        });

        (0, _mocha.it)('redirects correctly when authenticated as editor', async function () {
            let role = server.create('role', { name: 'Editor' });
            server.create('user', { roles: [role], slug: 'test-user' });

            server.create('user', { slug: 'no-access' });

            (0, _emberSimpleAuth.authenticateSession)(application);
            await visit('/team/no-access');

            (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team');
        });

        (0, _mocha.describe)('when logged in as admin', function () {
            let admin, adminRole, suspendedUser;

            (0, _mocha.beforeEach)(function () {
                server.loadFixtures('roles');
                adminRole = server.schema.roles.find(1);

                admin = server.create('user', { email: 'admin@example.com', roles: [adminRole] });

                // add an expired invite
                server.create('invite', { expires: _moment.default.utc().subtract(1, 'day').valueOf(), role: adminRole });

                // add a suspended user
                suspendedUser = server.create('user', { email: 'suspended@example.com', roles: [adminRole], status: 'inactive' });

                return (0, _emberSimpleAuth.authenticateSession)(application);
            });

            (0, _mocha.it)('it renders and navigates correctly', async function () {
                let user1 = server.create('user');
                let user2 = server.create('user');

                await visit('/team');

                // doesn't do any redirecting
                (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team');

                // it has correct page title
                (0, _chai.expect)(document.title, 'page title').to.equal('Team - Test Blog');

                // it shows active users in active section
                (0, _chai.expect)(find('[data-test-active-users] [data-test-user-id]').length, 'number of active users').to.equal(3);
                (0, _chai.expect)(find(`[data-test-active-users] [data-test-user-id="${user1.id}"]`)).to.exist;
                (0, _chai.expect)(find(`[data-test-active-users] [data-test-user-id="${user2.id}"]`)).to.exist;
                (0, _chai.expect)(find(`[data-test-active-users] [data-test-user-id="${admin.id}"]`)).to.exist;

                // it shows suspended users in suspended section
                (0, _chai.expect)(find('[data-test-suspended-users] [data-test-user-id]').length, 'number of suspended users').to.equal(1);
                (0, _chai.expect)(find(`[data-test-suspended-users] [data-test-user-id="${suspendedUser.id}"]`)).to.exist;

                await click(`[data-test-user-id="${user2.id}"]`);

                // url is correct
                (0, _chai.expect)(currentURL(), 'url after clicking user').to.equal(`/team/${user2.slug}`);

                // title is correct
                (0, _chai.expect)(document.title, 'title after clicking user').to.equal('Team - User - Test Blog');

                // view title should exist and be linkable and active
                (0, _chai.expect)(find('[data-test-screen-title] a[href="/ghost/team"]').hasClass('active'), 'has linkable url back to team main page').to.be.true;

                await click('[data-test-screen-title] a');

                // url should be /team again
                (0, _chai.expect)(currentURL(), 'url after clicking back').to.equal('/team');
            });

            (0, _mocha.it)('can manage invites', async function () {
                await visit('/team');

                // invite user button exists
                (0, _chai.expect)(find('.view-actions .gh-btn-green').text().trim(), 'invite people button text').to.equal('Invite People');

                // existing users are listed
                (0, _chai.expect)(find('[data-test-user-id]').length, 'initial number of active users').to.equal(2);

                (0, _chai.expect)(find('[data-test-user-id="1"] [data-test-role-name]').text().trim(), 'active user\'s role label').to.equal('Administrator');

                // existing invites are shown
                (0, _chai.expect)(find('[data-test-invite-id]').length, 'initial number of invited users').to.equal(1);

                (0, _chai.expect)(find('[data-test-invite-id="1"] [data-test-invite-description]').text(), 'expired invite description').to.match(/expired/);

                // remove expired invite
                await click('[data-test-invite-id="1"] [data-test-revoke-button]');

                (0, _chai.expect)(find('[data-test-invite-id]').length, 'initial number of invited users').to.equal(0);

                // click the invite people button
                await click('.view-actions .gh-btn-green');

                let roleOptions = find('.fullscreen-modal select[name="role"] option');

                function checkOwnerExists() {
                    for (let i in roleOptions) {
                        if (roleOptions[i].tagName === 'option' && roleOptions[i].text === 'Owner') {
                            return true;
                        }
                    }
                    return false;
                }

                function checkSelectedIsAuthor() {
                    for (let i in roleOptions) {
                        if (roleOptions[i].selected) {
                            return roleOptions[i].text === 'Author';
                        }
                    }
                    return false;
                }

                // modal is displayed
                (0, _chai.expect)(find('.fullscreen-modal h1').text().trim(), 'correct modal is displayed').to.equal('Invite a New User');

                // number of roles is correct
                (0, _chai.expect)(find('.fullscreen-modal select[name="role"] option').length, 'number of selectable roles').to.equal(3);

                (0, _chai.expect)(checkOwnerExists(), 'owner role isn\'t available').to.be.false;
                (0, _chai.expect)(checkSelectedIsAuthor(), 'author role is selected initially').to.be.true;

                // submit valid invite form
                await fillIn('.fullscreen-modal input[name="email"]', 'invite1@example.com');
                await click('.fullscreen-modal .gh-btn-green');

                // modal closes
                (0, _chai.expect)(find('.fullscreen-modal').length, 'number of modals after sending invite').to.equal(0);

                // invite is displayed, has correct e-mail + role
                (0, _chai.expect)(find('[data-test-invite-id]').length, 'number of invites after first invite').to.equal(1);

                (0, _chai.expect)(find('[data-test-invite-id="2"] [data-test-email]').text().trim(), 'displayed email of first invite').to.equal('invite1@example.com');

                (0, _chai.expect)(find('[data-test-invite-id="2"] [data-test-role-name]').text().trim(), 'displayed role of first invite').to.equal('Author');

                (0, _chai.expect)(find('[data-test-invite-id="2"] [data-test-invite-description]').text(), 'new invite description').to.match(/expires/);

                // number of users is unchanged
                (0, _chai.expect)(find('[data-test-user-id]').length, 'number of active users after first invite').to.equal(2);

                // submit new invite with different role
                await click('.view-actions .gh-btn-green');
                await fillIn('.fullscreen-modal input[name="email"]', 'invite2@example.com');
                await fillIn('.fullscreen-modal select[name="role"]', '2');
                await click('.fullscreen-modal .gh-btn-green');

                // number of invites increases
                (0, _chai.expect)(find('[data-test-invite-id]').length, 'number of invites after second invite').to.equal(2);

                // invite has correct e-mail + role
                (0, _chai.expect)(find('[data-test-invite-id="3"] [data-test-email]').text().trim(), 'displayed email of second invite').to.equal('invite2@example.com');

                (0, _chai.expect)(find('[data-test-invite-id="3"] [data-test-role-name]').text().trim(), 'displayed role of second invite').to.equal('Editor');

                // submit invite form with existing user
                await click('.view-actions .gh-btn-green');
                await fillIn('.fullscreen-modal input[name="email"]', 'admin@example.com');
                await click('.fullscreen-modal .gh-btn-green');

                // validation message is displayed
                (0, _chai.expect)(find('.fullscreen-modal .error .response').text().trim(), 'inviting existing user error').to.equal('A user with that email address already exists.');

                // submit invite form with existing invite
                await fillIn('.fullscreen-modal input[name="email"]', 'invite1@example.com');
                await click('.fullscreen-modal .gh-btn-green');

                // validation message is displayed
                (0, _chai.expect)(find('.fullscreen-modal .error .response').text().trim(), 'inviting invited user error').to.equal('A user with that email address was already invited.');

                // submit invite form with an invalid email
                await fillIn('.fullscreen-modal input[name="email"]', 'test');
                await click('.fullscreen-modal .gh-btn-green');

                // validation message is displayed
                (0, _chai.expect)(find('.fullscreen-modal .error .response').text().trim(), 'inviting invalid email error').to.equal('Invalid Email.');

                await click('.fullscreen-modal a.close');
                // revoke latest invite
                await click('[data-test-invite-id="3"] [data-test-revoke-button]');

                // number of invites decreases
                (0, _chai.expect)(find('[data-test-invite-id]').length, 'number of invites after revoke').to.equal(1);

                // notification is displayed
                (0, _chai.expect)(find('.gh-notification').text().trim(), 'notifications contain revoke').to.match(/Invitation revoked\. \(invite2@example\.com\)/);

                // correct invite is removed
                (0, _chai.expect)(find('[data-test-invite-id] [data-test-email]').text().trim(), 'displayed email of remaining invite').to.equal('invite1@example.com');

                // add another invite to test ordering on resend
                await click('.view-actions .gh-btn-green');
                await fillIn('.fullscreen-modal input[name="email"]', 'invite3@example.com');
                await click('.fullscreen-modal .gh-btn-green');

                // new invite should be last in the list
                (0, _chai.expect)(find('[data-test-invite-id]:last [data-test-email]').text().trim(), 'last invite email in list').to.equal('invite3@example.com');

                // resend first invite
                await click('[data-test-invite-id="2"] [data-test-resend-button]');

                // notification is displayed
                (0, _chai.expect)(find('.gh-notification').text().trim(), 'notifications contain resend').to.match(/Invitation resent! \(invite1@example\.com\)/);

                // first invite is still at the top
                (0, _chai.expect)(find('[data-test-invite-id]:first-of-type [data-test-email]').text().trim(), 'first invite email in list').to.equal('invite1@example.com');

                // regression test: can revoke a resent invite
                await click('[data-test-invite-id]:first-of-type [data-test-resend-button]');
                await click('[data-test-invite-id]:first-of-type [data-test-revoke-button]');

                // number of invites decreases
                (0, _chai.expect)(find('[data-test-invite-id]').length, 'number of invites after resend/revoke').to.equal(1);

                // notification is displayed
                (0, _chai.expect)(find('.gh-notification').text().trim(), 'notifications contain revoke after resend/revoke').to.match(/Invitation revoked\. \(invite1@example\.com\)/);
            });

            (0, _mocha.it)('can manage suspended users', async function () {
                await visit('/team');
                await click(`[data-test-user-id="${suspendedUser.id}"]`);

                (0, _chai.expect)(find('[data-test-suspended-badge]')).to.exist;

                await click('[data-test-user-actions]');
                await click('[data-test-unsuspend-button]');
                await click('[data-test-modal-confirm]');

                // NOTE: there seems to be a timing issue with this test - pausing
                // here confirms that the badge is removed but the andThen is firing
                // before the page is updated
                // andThen(() => {
                //     expect('[data-test-suspended-badge]').to.not.exist;
                // });

                await click('[data-test-team-link]');
                // suspendedUser is now in active list
                (0, _chai.expect)(find(`[data-test-active-users] [data-test-user-id="${suspendedUser.id}"]`)).to.exist;

                // no suspended users
                (0, _chai.expect)(find('[data-test-suspended-users] [data-test-user-id]').length).to.equal(0);

                await click(`[data-test-user-id="${suspendedUser.id}"]`);

                await click('[data-test-user-actions]');
                await click('[data-test-suspend-button]');
                await click('[data-test-modal-confirm]');
                (0, _chai.expect)(find('[data-test-suspended-badge]')).to.exist;
            });

            (0, _mocha.it)('can delete users', async function () {
                let user1 = server.create('user');
                let user2 = server.create('user');
                let post = server.create('post', { authors: [user2] });

                // we don't have a full many-to-many relationship in mirage so we
                // need to add the inverse manually
                user2.posts = [post];
                user2.save();

                await visit('/team');
                await click(`[data-test-user-id="${user1.id}"]`);

                // user deletion displays modal
                await click('button.delete');
                (0, _chai.expect)(find('.fullscreen-modal .modal-content:contains("delete this user")').length, 'user deletion modal displayed after button click').to.equal(1);

                // user has no posts so no warning about post deletion
                (0, _chai.expect)(find('.fullscreen-modal .modal-content:contains("is the author of")').length, 'deleting user with no posts has no post count').to.equal(0);

                // cancelling user deletion closes modal
                await click('.fullscreen-modal button:contains("Cancel")');
                (0, _chai.expect)(find('.fullscreen-modal').length === 0, 'delete user modal is closed when cancelling').to.be.true;

                // deleting a user with posts
                await visit('/team');
                await click(`[data-test-user-id="${user2.id}"]`);

                await click('button.delete');
                // user has  posts so should warn about post deletion
                (0, _chai.expect)(find('.fullscreen-modal .modal-content:contains("1 post created by this user")').length, 'deleting user with posts has post count').to.equal(1);

                await click('.fullscreen-modal button:contains("Delete")');
                // redirected to team page
                (0, _chai.expect)(currentURL()).to.equal('/team');

                // deleted user is not in list
                (0, _chai.expect)(find(`[data-test-user-id="${user2.id}"]`).length, 'deleted user is not in user list after deletion').to.equal(0);
            });

            (0, _mocha.describe)('existing user', function () {
                let user, newLocation, originalReplaceState;

                (0, _mocha.beforeEach)(function () {
                    user = server.create('user', {
                        slug: 'test-1',
                        name: 'Test User',
                        facebook: 'test',
                        twitter: '@test'
                    });

                    originalReplaceState = _windowProxy.default.replaceState;
                    _windowProxy.default.replaceState = function (params, title, url) {
                        newLocation = url;
                    };
                    newLocation = undefined;
                });

                (0, _mocha.afterEach)(function () {
                    _windowProxy.default.replaceState = originalReplaceState;
                });

                (0, _mocha.it)('input fields reset and validate correctly', async function () {
                    // test user name
                    await visit('/team/test-1');

                    (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team/test-1');
                    (0, _chai.expect)(find('[data-test-name-input]').val(), 'current user name').to.equal('Test User');

                    (0, _chai.expect)(find('[data-test-save-button]').text().trim(), 'save button text').to.equal('Save');

                    // test empty user name
                    await fillIn('[data-test-name-input]', '');
                    await triggerEvent('[data-test-name-input]', 'blur');

                    (0, _chai.expect)(find('.user-details-bottom .first-form-group').hasClass('error'), 'username input is in error state with blank input').to.be.true;

                    // test too long user name
                    await fillIn('[data-test-name-input]', new Array(195).join('a'));
                    await triggerEvent('[data-test-name-input]', 'blur');

                    (0, _chai.expect)(find('.user-details-bottom .first-form-group').hasClass('error'), 'username input is in error state with too long input').to.be.true;

                    // reset name field
                    await fillIn('[data-test-name-input]', 'Test User');

                    (0, _chai.expect)(find('[data-test-slug-input]').val(), 'slug value is default').to.equal('test-1');

                    await fillIn('[data-test-slug-input]', '');
                    await triggerEvent('[data-test-slug-input]', 'blur');

                    (0, _chai.expect)(find('[data-test-slug-input]').val(), 'slug value is reset to original upon empty string').to.equal('test-1');

                    // Save changes
                    await click('[data-test-save-button]');

                    (0, _chai.expect)(find('[data-test-save-button]').text().trim(), 'save button text').to.equal('Saved');

                    // CMD-S shortcut works
                    await fillIn('[data-test-slug-input]', 'Test User');
                    await triggerEvent('.gh-app', 'keydown', {
                        keyCode: 83, // s
                        metaKey: _ctrlOrCmd.default === 'command',
                        ctrlKey: _ctrlOrCmd.default === 'ctrl'
                    });

                    // we've already saved in this test so there's no on-screen indication
                    // that we've had another save, check the request was fired instead

                    var _server$pretender$han = server.pretender.handledRequests.slice(-1),
                        _server$pretender$han2 = _slicedToArray(_server$pretender$han, 1);

                    let lastRequest = _server$pretender$han2[0];

                    let params = JSON.parse(lastRequest.requestBody);

                    (0, _chai.expect)(params.users[0].name).to.equal('Test User');

                    // check that the history state has been updated
                    (0, _chai.expect)(newLocation).to.equal('Test User');

                    await fillIn('[data-test-slug-input]', 'white space');
                    await triggerEvent('[data-test-slug-input]', 'blur');

                    (0, _chai.expect)(find('[data-test-slug-input]').val(), 'slug value is correctly dasherized').to.equal('white-space');

                    await fillIn('[data-test-email-input]', 'thisisnotanemail');
                    await triggerEvent('[data-test-email-input]', 'blur');

                    (0, _chai.expect)(find('.user-details-bottom .form-group:nth-of-type(3)').hasClass('error'), 'email input should be in error state with invalid email').to.be.true;

                    await fillIn('[data-test-email-input]', 'test@example.com');
                    await fillIn('[data-test-location-input]', new Array(160).join('a'));
                    await triggerEvent('[data-test-location-input]', 'blur');

                    (0, _chai.expect)(find('[data-test-location-input]').closest('.form-group').hasClass('error'), 'location input should be in error state').to.be.true;

                    await fillIn('[data-test-location-input]', '');
                    await fillIn('[data-test-website-input]', 'thisisntawebsite');
                    await triggerEvent('[data-test-website-input]', 'blur');

                    (0, _chai.expect)(find('[data-test-website-input]').closest('.form-group').hasClass('error'), 'website input should be in error state').to.be.true;

                    let testSocialInput = async function testSocialInput(type, input, expectedValue, expectedError = '') {
                        await fillIn(`[data-test-${type}-input]`, input);
                        await triggerEvent(`[data-test-${type}-input]`, 'blur');

                        (0, _chai.expect)(find(`[data-test-${type}-input]`).val(), `${type} value for ${input}`).to.equal(expectedValue);

                        (0, _chai.expect)(find(`[data-test-${type}-error]`).text().trim(), `${type} validation response for ${input}`).to.equal(expectedError);

                        (0, _chai.expect)(find(`[data-test-${type}-input]`).closest('.form-group').hasClass('error'), `${type} input should be in error state with '${input}'`).to.equal(!!expectedError);
                    };

                    let testFacebookValidation = async (...args) => testSocialInput('facebook', ...args);
                    let testTwitterValidation = async (...args) => testSocialInput('twitter', ...args);

                    // Testing Facebook input

                    // displays initial value
                    (0, _chai.expect)(find('[data-test-facebook-input]').val(), 'initial facebook value').to.equal('https://www.facebook.com/test');

                    await triggerEvent('[data-test-facebook-input]', 'focus');
                    await triggerEvent('[data-test-facebook-input]', 'blur');

                    // regression test: we still have a value after the input is
                    // focused and then blurred without any changes
                    (0, _chai.expect)(find('[data-test-facebook-input]').val(), 'facebook value after blur with no change').to.equal('https://www.facebook.com/test');

                    await testFacebookValidation('facebook.com/username', 'https://www.facebook.com/username');

                    await testFacebookValidation('testuser', 'https://www.facebook.com/testuser');

                    await testFacebookValidation('ab99', 'https://www.facebook.com/ab99');

                    await testFacebookValidation('page/ab99', 'https://www.facebook.com/page/ab99');

                    await testFacebookValidation('page/*(&*(%%))', 'https://www.facebook.com/page/*(&*(%%))');

                    await testFacebookValidation('facebook.com/pages/some-facebook-page/857469375913?ref=ts', 'https://www.facebook.com/pages/some-facebook-page/857469375913?ref=ts');

                    await testFacebookValidation('https://www.facebook.com/groups/savethecrowninn', 'https://www.facebook.com/groups/savethecrowninn');

                    await testFacebookValidation('http://github.com/username', 'http://github.com/username', 'The URL must be in a format like https://www.facebook.com/yourPage');

                    await testFacebookValidation('http://github.com/pages/username', 'http://github.com/pages/username', 'The URL must be in a format like https://www.facebook.com/yourPage');

                    // Testing Twitter input

                    // loads fixtures and performs transform
                    (0, _chai.expect)(find('[data-test-twitter-input]').val(), 'initial twitter value').to.equal('https://twitter.com/test');

                    await triggerEvent('[data-test-twitter-input]', 'focus');
                    await triggerEvent('[data-test-twitter-input]', 'blur');

                    // regression test: we still have a value after the input is
                    // focused and then blurred without any changes
                    (0, _chai.expect)(find('[data-test-twitter-input]').val(), 'twitter value after blur with no change').to.equal('https://twitter.com/test');

                    await testTwitterValidation('twitter.com/username', 'https://twitter.com/username');

                    await testTwitterValidation('testuser', 'https://twitter.com/testuser');

                    await testTwitterValidation('http://github.com/username', 'https://twitter.com/username');

                    await testTwitterValidation('*(&*(%%))', '*(&*(%%))', 'The URL must be in a format like https://twitter.com/yourUsername');

                    await testTwitterValidation('thisusernamehasmorethan15characters', 'thisusernamehasmorethan15characters', 'Your Username is not a valid Twitter Username');

                    // Testing bio input

                    await fillIn('[data-test-website-input]', '');
                    await fillIn('[data-test-bio-input]', new Array(210).join('a'));
                    await triggerEvent('[data-test-bio-input]', 'blur');

                    (0, _chai.expect)(find('[data-test-bio-input]').closest('.form-group').hasClass('error'), 'bio input should be in error state').to.be.true;

                    // password reset ------

                    // button triggers validation
                    await click('[data-test-save-pw-button]');

                    (0, _chai.expect)(find('[data-test-new-pass-input]').closest('.form-group').hasClass('error'), 'new password has error class when blank').to.be.true;

                    (0, _chai.expect)(find('[data-test-new-pass-input]').siblings('.response').text(), 'new password error when blank').to.match(/can't be blank/);

                    // validates too short password (< 10 characters)
                    await fillIn('[data-test-new-pass-input]', 'notlong');
                    await fillIn('[data-test-ne2-pass-input]', 'notlong');

                    // enter key triggers action
                    await keyEvent('[data-test-new-pass-input]', 'keyup', 13);

                    (0, _chai.expect)(find('[data-test-new-pass-input]').closest('.form-group').hasClass('error'), 'new password has error class when password too short').to.be.true;

                    (0, _chai.expect)(find('[data-test-new-pass-input]').siblings('.response').text(), 'confirm password error when it\'s too short').to.match(/at least 10 characters long/);

                    // validates unsafe password
                    await fillIn('#user-password-new', 'ghostisawesome');
                    await fillIn('#user-new-password-verification', 'ghostisawesome');

                    // enter key triggers action
                    await keyEvent('#user-password-new', 'keyup', 13);

                    (0, _chai.expect)(find('#user-password-new').closest('.form-group').hasClass('error'), 'new password has error class when password is insecure').to.be.true;

                    (0, _chai.expect)(find('#user-password-new').siblings('.response').text(), 'confirm password error when it\'s insecure').to.match(/you cannot use an insecure password/);

                    // typing in inputs clears validation
                    await fillIn('[data-test-new-pass-input]', 'thisissupersafe');
                    await triggerEvent('[data-test-new-pass-input]', 'input');

                    (0, _chai.expect)(find('[data-test-new-pass-input]').closest('.form-group').hasClass('error'), 'password validation is visible after typing').to.be.false;

                    // enter key triggers action
                    await keyEvent('[data-test-new-pass-input]', 'keyup', 13);

                    (0, _chai.expect)(find('[data-test-ne2-pass-input]').closest('.form-group').hasClass('error'), 'confirm password has error class when it doesn\'t match').to.be.true;

                    (0, _chai.expect)(find('[data-test-ne2-pass-input]').siblings('.response').text(), 'confirm password error when it doesn\'t match').to.match(/do not match/);

                    // submits with correct details
                    await fillIn('[data-test-ne2-pass-input]', 'thisissupersafe');
                    await click('[data-test-save-pw-button]');

                    // hits the endpoint

                    var _server$pretender$han3 = server.pretender.handledRequests.slice(-1),
                        _server$pretender$han4 = _slicedToArray(_server$pretender$han3, 1);

                    let newRequest = _server$pretender$han4[0];

                    params = JSON.parse(newRequest.requestBody);

                    (0, _chai.expect)(newRequest.url, 'password request URL').to.match(/\/users\/password/);

                    // eslint-disable-next-line camelcase
                    (0, _chai.expect)(params.password[0].user_id).to.equal(user.id.toString());
                    (0, _chai.expect)(params.password[0].newPassword).to.equal('thisissupersafe');
                    (0, _chai.expect)(params.password[0].ne2Password).to.equal('thisissupersafe');

                    // clears the fields
                    (0, _chai.expect)(find('[data-test-new-pass-input]').val(), 'password field after submit').to.be.empty;

                    (0, _chai.expect)(find('[data-test-ne2-pass-input]').val(), 'password verification field after submit').to.be.empty;

                    // displays a notification
                    (0, _chai.expect)(find('.gh-notifications .gh-notification').length, 'password saved notification is displayed').to.equal(1);
                });

                (0, _mocha.it)('warns when leaving without saving', async function () {
                    await visit('/team/test-1');

                    (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team/test-1');

                    await fillIn('[data-test-slug-input]', 'another slug');
                    await triggerEvent('[data-test-slug-input]', 'blur');

                    (0, _chai.expect)(find('[data-test-slug-input]').val()).to.be.equal('another-slug');

                    await fillIn('[data-test-facebook-input]', 'testuser');
                    await triggerEvent('[data-test-facebook-input]', 'blur');

                    (0, _chai.expect)(find('[data-test-facebook-input]').val()).to.be.equal('https://www.facebook.com/testuser');

                    await visit('/settings/team');

                    (0, _chai.expect)(find('.fullscreen-modal').length, 'modal exists').to.equal(1);

                    // Leave without saving
                    await (click('.fullscreen-modal [data-test-leave-button]'), 'leave without saving');

                    (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/settings/team');

                    await visit('/team/test-1');

                    (0, _chai.expect)(currentURL(), 'currentURL').to.equal('/team/test-1');

                    // settings were not saved
                    (0, _chai.expect)(find('[data-test-slug-input]').val()).to.be.equal('test-1');
                    (0, _chai.expect)(find('[data-test-facebook-input]').val()).to.be.equal('https://www.facebook.com/test');
                });
            });

            (0, _mocha.describe)('own user', function () {
                (0, _mocha.it)('requires current password when changing password', async function () {
                    await visit(`/team/${admin.slug}`);

                    // test the "old password" field is validated
                    await click('[data-test-save-pw-button]');

                    // old password has error
                    (0, _chai.expect)(find('[data-test-old-pass-input]').closest('.form-group').hasClass('error'), 'old password has error class when blank').to.be.true;

                    (0, _chai.expect)(find('[data-test-old-pass-input]').siblings('.response').text(), 'old password error when blank').to.match(/is required/);

                    // new password has error
                    (0, _chai.expect)(find('[data-test-new-pass-input]').closest('.form-group').hasClass('error'), 'new password has error class when blank').to.be.true;

                    (0, _chai.expect)(find('[data-test-new-pass-input]').siblings('.response').text(), 'new password error when blank').to.match(/can't be blank/);

                    // validation is cleared when typing
                    await fillIn('[data-test-old-pass-input]', 'password');
                    await triggerEvent('[data-test-old-pass-input]', 'input');

                    (0, _chai.expect)(find('[data-test-old-pass-input]').closest('.form-group').hasClass('error'), 'old password validation is in error state after typing').to.be.false;
                });
            });

            (0, _mocha.it)('redirects to 404 when user does not exist', async function () {
                server.get('/users/slug/unknown/', function () {
                    return new _emberCliMirage.Response(404, { 'Content-Type': 'application/json' }, { errors: [{ message: 'User not found.', errorType: 'NotFoundError' }] });
                });

                (0, _adapterError.errorOverride)();

                await visit('/team/unknown');

                (0, _adapterError.errorReset)();
                (0, _chai.expect)(currentPath()).to.equal('error404');
                (0, _chai.expect)(currentURL()).to.equal('/team/unknown');
            });
        });

        (0, _mocha.describe)('when logged in as author', function () {
            let adminRole, authorRole;

            (0, _mocha.beforeEach)(function () {
                adminRole = server.create('role', { name: 'Administrator' });
                authorRole = server.create('role', { name: 'Author' });
                server.create('user', { roles: [authorRole] });

                server.get('/invites/', function () {
                    return new _emberCliMirage.Response(403, {}, {
                        errors: [{
                            errorType: 'NoPermissionError',
                            message: 'You do not have permission to perform this action'
                        }]
                    });
                });

                return (0, _emberSimpleAuth.authenticateSession)(application);
            });

            (0, _mocha.it)('can access the team page', async function () {
                server.create('user', { roles: [adminRole] });
                server.create('invite', { role: authorRole });

                (0, _adapterError.errorOverride)();

                await visit('/team');

                (0, _adapterError.errorReset)();
                (0, _chai.expect)(currentPath()).to.equal('team.index');
                (0, _chai.expect)(find('.gh-alert').length).to.equal(0);
            });
        });
    });
});
define('ghost-admin/tests/app.lint-test', [], function () {
  'use strict';

  describe('ESLint | app', function () {

    it('adapters/application.js', function () {
      // test passed
    });

    it('adapters/base.js', function () {
      // test passed
    });

    it('adapters/embedded-relation-adapter.js', function () {
      // test passed
    });

    it('adapters/setting.js', function () {
      // test passed
    });

    it('adapters/tag.js', function () {
      // test passed
    });

    it('adapters/theme.js', function () {
      // test passed
    });

    it('adapters/user.js', function () {
      // test passed
    });

    it('app.js', function () {
      // test passed
    });

    it('authenticators/oauth2.js', function () {
      // test passed
    });

    it('components/gh-activating-list-item.js', function () {
      // test passed
    });

    it('components/gh-alert.js', function () {
      // test passed
    });

    it('components/gh-alerts.js', function () {
      // test passed
    });

    it('components/gh-app.js', function () {
      // test passed
    });

    it('components/gh-basic-dropdown.js', function () {
      // test passed
    });

    it('components/gh-blog-url.js', function () {
      // test passed
    });

    it('components/gh-cm-editor.js', function () {
      // test passed
    });

    it('components/gh-content-cover.js', function () {
      // test passed
    });

    it('components/gh-date-time-picker.js', function () {
      // test passed
    });

    it('components/gh-download-count.js', function () {
      // test passed
    });

    it('components/gh-dropdown-button.js', function () {
      // test passed
    });

    it('components/gh-dropdown.js', function () {
      // test passed
    });

    it('components/gh-editor-post-status.js', function () {
      // test passed
    });

    it('components/gh-editor.js', function () {
      // test passed
    });

    it('components/gh-error-message.js', function () {
      // test passed
    });

    it('components/gh-feature-flag.js', function () {
      // test passed
    });

    it('components/gh-file-input.js', function () {
      // test passed
    });

    it('components/gh-file-upload.js', function () {
      // test passed
    });

    it('components/gh-file-uploader.js', function () {
      // test passed
    });

    it('components/gh-form-group.js', function () {
      // test passed
    });

    it('components/gh-fullscreen-modal.js', function () {
      // test passed
    });

    it('components/gh-image-uploader-with-preview.js', function () {
      // test passed
    });

    it('components/gh-image-uploader.js', function () {
      // test passed
    });

    it('components/gh-koenig-editor.js', function () {
      // test passed
    });

    it('components/gh-loading-spinner.js', function () {
      // test passed
    });

    it('components/gh-main.js', function () {
      // test passed
    });

    it('components/gh-markdown-editor.js', function () {
      // test passed
    });

    it('components/gh-menu-toggle.js', function () {
      // test passed
    });

    it('components/gh-mobile-nav-bar.js', function () {
      // test passed
    });

    it('components/gh-nav-menu.js', function () {
      // test passed
    });

    it('components/gh-navitem-url-input.js', function () {
      // test passed
    });

    it('components/gh-navitem.js', function () {
      // test passed
    });

    it('components/gh-notification.js', function () {
      // test passed
    });

    it('components/gh-notifications.js', function () {
      // test passed
    });

    it('components/gh-post-settings-menu.js', function () {
      // test passed
    });

    it('components/gh-posts-list-item.js', function () {
      // test passed
    });

    it('components/gh-profile-image.js', function () {
      // test passed
    });

    it('components/gh-progress-bar.js', function () {
      // test passed
    });

    it('components/gh-psm-authors-input.js', function () {
      // test passed
    });

    it('components/gh-psm-tags-input.js', function () {
      // test passed
    });

    it('components/gh-psm-template-select.js', function () {
      // test passed
    });

    it('components/gh-publishmenu-draft.js', function () {
      // test passed
    });

    it('components/gh-publishmenu-published.js', function () {
      // test passed
    });

    it('components/gh-publishmenu-scheduled.js', function () {
      // test passed
    });

    it('components/gh-publishmenu.js', function () {
      // test passed
    });

    it('components/gh-scheduled-post-countdown.js', function () {
      // test passed
    });

    it('components/gh-scroll-trigger.js', function () {
      // test passed
    });

    it('components/gh-search-input-trigger.js', function () {
      // test passed
    });

    it('components/gh-search-input.js', function () {
      // test passed
    });

    it('components/gh-simplemde.js', function () {
      // test passed
    });

    it('components/gh-skip-link.js', function () {
      // test passed
    });

    it('components/gh-subscribers-table.js', function () {
      // test passed
    });

    it('components/gh-tag-settings-form.js', function () {
      // test passed
    });

    it('components/gh-tag.js', function () {
      // test passed
    });

    it('components/gh-tags-management-container.js', function () {
      // test passed
    });

    it('components/gh-task-button.js', function () {
      // test passed
    });

    it('components/gh-text-input.js', function () {
      // test passed
    });

    it('components/gh-textarea.js', function () {
      // test passed
    });

    it('components/gh-theme-error-li.js', function () {
      // test passed
    });

    it('components/gh-theme-table.js', function () {
      // test passed
    });

    it('components/gh-timezone-select.js', function () {
      // test passed
    });

    it('components/gh-token-input.js', function () {
      // test passed
    });

    it('components/gh-token-input/select-multiple.js', function () {
      // test passed
    });

    it('components/gh-token-input/select.js', function () {
      // test passed
    });

    it('components/gh-token-input/suggested-option.js', function () {
      // test passed
    });

    it('components/gh-token-input/tag-token.js', function () {
      // test passed
    });

    it('components/gh-token-input/trigger.js', function () {
      // test passed
    });

    it('components/gh-tour-item.js', function () {
      // test passed
    });

    it('components/gh-trim-focus-input.js', function () {
      // test passed
    });

    it('components/gh-unsplash-photo.js', function () {
      // test passed
    });

    it('components/gh-unsplash.js', function () {
      // test passed
    });

    it('components/gh-uploader.js', function () {
      // test passed
    });

    it('components/gh-url-preview.js', function () {
      // test passed
    });

    it('components/gh-user-active.js', function () {
      // test passed
    });

    it('components/gh-user-invited.js', function () {
      // test passed
    });

    it('components/gh-user-list-item.js', function () {
      // test passed
    });

    it('components/gh-validation-status-container.js', function () {
      // test passed
    });

    it('components/gh-view-title.js', function () {
      // test passed
    });

    it('components/modal-base.js', function () {
      // test passed
    });

    it('components/modal-delete-all.js', function () {
      // test passed
    });

    it('components/modal-delete-post.js', function () {
      // test passed
    });

    it('components/modal-delete-subscriber.js', function () {
      // test passed
    });

    it('components/modal-delete-tag.js', function () {
      // test passed
    });

    it('components/modal-delete-theme.js', function () {
      // test passed
    });

    it('components/modal-delete-user.js', function () {
      // test passed
    });

    it('components/modal-import-subscribers.js', function () {
      // test passed
    });

    it('components/modal-invite-new-user.js', function () {
      // test passed
    });

    it('components/modal-leave-editor.js', function () {
      // test passed
    });

    it('components/modal-leave-settings.js', function () {
      // test passed
    });

    it('components/modal-markdown-help.js', function () {
      // test passed
    });

    it('components/modal-new-subscriber.js', function () {
      // test passed
    });

    it('components/modal-re-authenticate.js', function () {
      // test passed
    });

    it('components/modal-suspend-user.js', function () {
      // test passed
    });

    it('components/modal-theme-warnings.js', function () {
      // test passed
    });

    it('components/modal-transfer-owner.js', function () {
      // test passed
    });

    it('components/modal-unsuspend-user.js', function () {
      // test passed
    });

    it('components/modal-upload-image.js', function () {
      // test passed
    });

    it('components/modal-upload-theme.js', function () {
      // test passed
    });

    it('components/power-select-vertical-collection-options.js', function () {
      // test passed
    });

    it('components/power-select/trigger.js', function () {
      // test passed
    });

    it('controllers/about.js', function () {
      // test passed
    });

    it('controllers/application.js', function () {
      // test passed
    });

    it('controllers/editor.js', function () {
      // test passed
    });

    it('controllers/error.js', function () {
      // test passed
    });

    it('controllers/posts-loading.js', function () {
      // test passed
    });

    it('controllers/posts.js', function () {
      // test passed
    });

    it('controllers/reset.js', function () {
      // test passed
    });

    it('controllers/settings/apps/amp.js', function () {
      // test passed
    });

    it('controllers/settings/apps/index.js', function () {
      // test passed
    });

    it('controllers/settings/apps/slack.js', function () {
      // test passed
    });

    it('controllers/settings/apps/unsplash.js', function () {
      // test passed
    });

    it('controllers/settings/apps/zapier.js', function () {
      // test passed
    });

    it('controllers/settings/code-injection.js', function () {
      // test passed
    });

    it('controllers/settings/design.js', function () {
      // test passed
    });

    it('controllers/settings/general.js', function () {
      // test passed
    });

    it('controllers/settings/labs.js', function () {
      // test passed
    });

    it('controllers/settings/tags.js', function () {
      // test passed
    });

    it('controllers/settings/tags/tag.js', function () {
      // test passed
    });

    it('controllers/setup.js', function () {
      // test passed
    });

    it('controllers/setup/three.js', function () {
      // test passed
    });

    it('controllers/setup/two.js', function () {
      // test passed
    });

    it('controllers/signin.js', function () {
      // test passed
    });

    it('controllers/signup.js', function () {
      // test passed
    });

    it('controllers/subscribers.js', function () {
      // test passed
    });

    it('controllers/team/index.js', function () {
      // test passed
    });

    it('controllers/team/user.js', function () {
      // test passed
    });

    it('helpers/background-image-style.js', function () {
      // test passed
    });

    it('helpers/gh-count-characters.js', function () {
      // test passed
    });

    it('helpers/gh-count-down-characters.js', function () {
      // test passed
    });

    it('helpers/gh-format-html.js', function () {
      // test passed
    });

    it('helpers/gh-format-post-time.js', function () {
      // test passed
    });

    it('helpers/gh-path.js', function () {
      // test passed
    });

    it('helpers/gh-user-can-admin.js', function () {
      // test passed
    });

    it('helpers/highlighted-text.js', function () {
      // test passed
    });

    it('helpers/is-equal.js', function () {
      // test passed
    });

    it('helpers/is-not.js', function () {
      // test passed
    });

    it('initializers/ember-simple-auth.js', function () {
      // test passed
    });

    it('initializers/trailing-hash.js', function () {
      // test passed
    });

    it('initializers/upgrade-status.js', function () {
      // test passed
    });

    it('mixins/body-event-listener.js', function () {
      // test passed
    });

    it('mixins/current-user-settings.js', function () {
      // test passed
    });

    it('mixins/dropdown-mixin.js', function () {
      // test passed
    });

    it('mixins/pagination.js', function () {
      // test passed
    });

    it('mixins/settings-menu-component.js', function () {
      // test passed
    });

    it('mixins/shortcuts-route.js', function () {
      // test passed
    });

    it('mixins/shortcuts.js', function () {
      // test passed
    });

    it('mixins/slug-url.js', function () {
      // test passed
    });

    it('mixins/style-body.js', function () {
      // test passed
    });

    it('mixins/text-input.js', function () {
      // test passed
    });

    it('mixins/unauthenticated-route-mixin.js', function () {
      // test passed
    });

    it('mixins/validation-engine.js', function () {
      // test passed
    });

    it('mixins/validation-state.js', function () {
      // test passed
    });

    it('models/invite.js', function () {
      // test passed
    });

    it('models/navigation-item.js', function () {
      // test passed
    });

    it('models/notification.js', function () {
      // test passed
    });

    it('models/post.js', function () {
      // test passed
    });

    it('models/role.js', function () {
      // test passed
    });

    it('models/setting.js', function () {
      // test passed
    });

    it('models/slack-integration.js', function () {
      // test passed
    });

    it('models/subscriber.js', function () {
      // test passed
    });

    it('models/tag.js', function () {
      // test passed
    });

    it('models/theme.js', function () {
      // test passed
    });

    it('models/unsplash-integration.js', function () {
      // test passed
    });

    it('models/user.js', function () {
      // test passed
    });

    it('resolver.js', function () {
      // test passed
    });

    it('router.js', function () {
      // test passed
    });

    it('routes/about.js', function () {
      // test passed
    });

    it('routes/application.js', function () {
      // test passed
    });

    it('routes/authenticated.js', function () {
      // test passed
    });

    it('routes/editor.js', function () {
      // test passed
    });

    it('routes/editor/edit.js', function () {
      // test passed
    });

    it('routes/editor/new.js', function () {
      // test passed
    });

    it('routes/error404.js', function () {
      // test passed
    });

    it('routes/posts.js', function () {
      // test passed
    });

    it('routes/reset.js', function () {
      // test passed
    });

    it('routes/settings/apps.js', function () {
      // test passed
    });

    it('routes/settings/apps/amp.js', function () {
      // test passed
    });

    it('routes/settings/apps/slack.js', function () {
      // test passed
    });

    it('routes/settings/apps/unsplash.js', function () {
      // test passed
    });

    it('routes/settings/apps/zapier.js', function () {
      // test passed
    });

    it('routes/settings/code-injection.js', function () {
      // test passed
    });

    it('routes/settings/design.js', function () {
      // test passed
    });

    it('routes/settings/design/uploadtheme.js', function () {
      // test passed
    });

    it('routes/settings/general.js', function () {
      // test passed
    });

    it('routes/settings/labs.js', function () {
      // test passed
    });

    it('routes/settings/tags.js', function () {
      // test passed
    });

    it('routes/settings/tags/index.js', function () {
      // test passed
    });

    it('routes/settings/tags/new.js', function () {
      // test passed
    });

    it('routes/settings/tags/tag.js', function () {
      // test passed
    });

    it('routes/setup.js', function () {
      // test passed
    });

    it('routes/setup/index.js', function () {
      // test passed
    });

    it('routes/setup/three.js', function () {
      // test passed
    });

    it('routes/signin.js', function () {
      // test passed
    });

    it('routes/signout.js', function () {
      // test passed
    });

    it('routes/signup.js', function () {
      // test passed
    });

    it('routes/subscribers.js', function () {
      // test passed
    });

    it('routes/subscribers/import.js', function () {
      // test passed
    });

    it('routes/subscribers/new.js', function () {
      // test passed
    });

    it('routes/team/index.js', function () {
      // test passed
    });

    it('routes/team/user.js', function () {
      // test passed
    });

    it('serializers/application.js', function () {
      // test passed
    });

    it('serializers/invite.js', function () {
      // test passed
    });

    it('serializers/notification.js', function () {
      // test passed
    });

    it('serializers/post.js', function () {
      // test passed
    });

    it('serializers/role.js', function () {
      // test passed
    });

    it('serializers/setting.js', function () {
      // test passed
    });

    it('serializers/subscriber.js', function () {
      // test passed
    });

    it('serializers/tag.js', function () {
      // test passed
    });

    it('serializers/theme.js', function () {
      // test passed
    });

    it('serializers/user.js', function () {
      // test passed
    });

    it('services/ajax.js', function () {
      // test passed
    });

    it('services/clock.js', function () {
      // test passed
    });

    it('services/config.js', function () {
      // test passed
    });

    it('services/dropdown.js', function () {
      // test passed
    });

    it('services/event-bus.js', function () {
      // test passed
    });

    it('services/feature.js', function () {
      // test passed
    });

    it('services/ghost-paths.js', function () {
      // test passed
    });

    it('services/lazy-loader.js', function () {
      // test passed
    });

    it('services/media-queries.js', function () {
      // test passed
    });

    it('services/notifications.js', function () {
      // test passed
    });

    it('services/resize-detector.js', function () {
      // test passed
    });

    it('services/session.js', function () {
      // test passed
    });

    it('services/settings.js', function () {
      // test passed
    });

    it('services/slug-generator.js', function () {
      // test passed
    });

    it('services/tour.js', function () {
      // test passed
    });

    it('services/ui.js', function () {
      // test passed
    });

    it('services/unsplash.js', function () {
      // test passed
    });

    it('services/upgrade-status.js', function () {
      // test passed
    });

    it('session-stores/application.js', function () {
      // test passed
    });

    it('transforms/facebook-url-user.js', function () {
      // test passed
    });

    it('transforms/json-string.js', function () {
      // test passed
    });

    it('transforms/moment-date.js', function () {
      // test passed
    });

    it('transforms/moment-utc.js', function () {
      // test passed
    });

    it('transforms/navigation-settings.js', function () {
      // test passed
    });

    it('transforms/raw.js', function () {
      // test passed
    });

    it('transforms/slack-settings.js', function () {
      // test passed
    });

    it('transforms/twitter-url-user.js', function () {
      // test passed
    });

    it('transforms/unsplash-settings.js', function () {
      // test passed
    });

    it('transitions.js', function () {
      // test passed
    });

    it('transitions/wormhole.js', function () {
      // test passed
    });

    it('utils/bound-one-way.js', function () {
      // test passed
    });

    it('utils/caja-sanitizers.js', function () {
      // test passed
    });

    it('utils/ctrl-or-cmd.js', function () {
      // test passed
    });

    it('utils/document-title.js', function () {
      // test passed
    });

    it('utils/format-markdown.js', function () {
      // test passed
    });

    it('utils/ghost-paths.js', function () {
      // test passed
    });

    it('utils/isFinite.js', function () {
      // test passed
    });

    it('utils/isNumber.js', function () {
      // test passed
    });

    it('utils/link-component.js', function () {
      // test passed
    });

    it('utils/random-password.js', function () {
      // test passed
    });

    it('utils/route.js', function () {
      // test passed
    });

    it('utils/text-field.js', function () {
      // test passed
    });

    it('utils/titleize.js', function () {
      // test passed
    });

    it('utils/window-proxy.js', function () {
      // test passed
    });

    it('validators/base.js', function () {
      // test passed
    });

    it('validators/invite-user.js', function () {
      // test passed
    });

    it('validators/nav-item.js', function () {
      // test passed
    });

    it('validators/new-user.js', function () {
      // test passed
    });

    it('validators/password.js', function () {
      // test passed
    });

    it('validators/post.js', function () {
      // test passed
    });

    it('validators/reset.js', function () {
      // test passed
    });

    it('validators/setting.js', function () {
      // test passed
    });

    it('validators/setup.js', function () {
      // test passed
    });

    it('validators/signin.js', function () {
      // test passed
    });

    it('validators/signup.js', function () {
      // test passed
    });

    it('validators/slack-integration.js', function () {
      // test passed
    });

    it('validators/subscriber.js', function () {
      // test passed
    });

    it('validators/tag-settings.js', function () {
      // test passed
    });

    it('validators/user.js', function () {
      // test passed
    });
  });
});
define('ghost-admin/tests/helpers/adapter-error', ['exports'], function (exports) {
    'use strict';

    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.errorOverride = errorOverride;
    exports.errorReset = errorReset;
    const Logger = Ember.Logger;


    let originalException, originalLoggerError;

    function errorOverride() {
        originalException = Ember.Test.adapter.exception;
        originalLoggerError = Logger.error;
        Ember.Test.adapter.exception = function () {};
        Logger.error = function () {};
    }

    function errorReset() {
        Ember.Test.adapter.exception = originalException;
        Logger.error = originalLoggerError;
    }
});
define('ghost-admin/tests/helpers/data-transfer', ['exports'], function (exports) {
  'use strict';

  Object.defineProperty(exports, "__esModule", {
    value: true
  });


  var c = Ember.Object.extend({
    getData: function getData() {
      return this.get('payload');
    },

    setData: function setData(dataType, payload) {
      this.set("data", { dataType: dataType, payload: payload });
    }
  });

  c.reopenClass({
    makeMockEvent: function makeMockEvent(payload) {
      var transfer = this.create({ payload: payload });
      var res = { dataTransfer: transfer };
      res.originalEvent = res;
      res.originalEvent.preventDefault = function () {
        console.log('prevent default');
      };
      res.originalEvent.stopPropagation = function () {
        console.log('stop propagation');
      };
      return res;
    },

    createDomEvent: function createDomEvent(type) {
      var event = document.createEvent("CustomEvent");
      event.initCustomEvent(type, true, true, null);
      event.dataTransfer = {
        data: {},
        setData: function setData(type, val) {
          this.data[type] = val;
        },
        getData: function getData(type) {
          return this.data[type];
        }
      };
      return event;
    }
  });

  exports.default = c;
});
define('ghost-admin/tests/helpers/destroy-app', ['exports'], function (exports) {
    'use strict';

    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.default = destroyApp;
    function destroyApp(application) {
        // this is required to fix "second Pretender instance" warnings
        if (server) {
            server.shutdown();
        }

        // extra check to ensure we don't have references hanging around via key
        // bindings on supposedly destroyed objects
        key.deleteScope('default');

        Ember.run(application, 'destroy');
    } /* global key */
});
define('ghost-admin/tests/helpers/drag-drop', ['exports', 'ember-native-dom-helpers', 'ghost-admin/tests/helpers/mock-event'], function (exports, _emberNativeDomHelpers, _mockEvent) {
  'use strict';

  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.drag = drag;


  async function dragOver(dropSelector, moves) {
    moves = moves || [[{ clientX: 1, clientY: 1 }, dropSelector]];
    return moves.forEach(async ([position, selector]) => {
      let event = new _mockEvent.default(position);
      await (0, _emberNativeDomHelpers.triggerEvent)(selector || dropSelector, 'dragover', event);
    });
  }

  async function drop(dragSelector, dragEvent, options) {
    let dropSelector = options.drop,
        dropEndOptions = options.dropEndOptions,
        dragOverMoves = options.dragOverMoves;


    let dropElement = await (0, _emberNativeDomHelpers.find)(dropSelector);
    if (!dropElement) {
      throw `There are no drop targets by the given selector: '${dropSelector}'`;
    }

    await dragOver(dropSelector, dragOverMoves);

    if (options.beforeDrop) {
      await options.beforeDrop.call();
    }

    let event = new _mockEvent.default().useDataTransferData(dragEvent);
    await (0, _emberNativeDomHelpers.triggerEvent)(dropSelector, 'drop', event);

    return await (0, _emberNativeDomHelpers.triggerEvent)(dragSelector, 'dragend', dropEndOptions);
  }

  async function drag(dragSelector, options = {}) {
    let dragEvent = new _mockEvent.default(options.dragStartOptions);

    await (0, _emberNativeDomHelpers.triggerEvent)(dragSelector, 'mouseover');

    await (0, _emberNativeDomHelpers.triggerEvent)(dragSelector, 'dragstart', dragEvent);

    if (options.afterDrag) {
      await options.afterDrag.call();
    }

    if (options.drop) {
      await drop(dragSelector, dragEvent, options);
    }
  }
});
define('ghost-admin/tests/helpers/ember-basic-dropdown', ['exports', 'ember-basic-dropdown/test-support/helpers', 'ember-native-dom-helpers'], function (exports, _helpers, _emberNativeDomHelpers) {
  'use strict';

  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.nativeClick = exports.fireKeydown = exports.tapTrigger = exports.clickTrigger = exports.nativeTap = undefined;
  Object.defineProperty(exports, 'nativeTap', {
    enumerable: true,
    get: function () {
      return _helpers.nativeTap;
    }
  });
  Object.defineProperty(exports, 'clickTrigger', {
    enumerable: true,
    get: function () {
      return _helpers.clickTrigger;
    }
  });
  Object.defineProperty(exports, 'tapTrigger', {
    enumerable: true,
    get: function () {
      return _helpers.tapTrigger;
    }
  });
  Object.defineProperty(exports, 'fireKeydown', {
    enumerable: true,
    get: function () {
      return _helpers.fireKeydown;
    }
  });
  exports.default = _helpers.default;
  const nativeClick = exports.nativeClick = _emberNativeDomHelpers.click;
});
define('ghost-admin/tests/helpers/ember-drag-drop', ['exports', 'ghost-admin/tests/helpers/data-transfer'], function (exports, _dataTransfer) {
  'use strict';

  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.drag = drag;


  function drop($dragHandle, dropCssPath, dragEvent) {
    let $dropTarget = Ember.$(dropCssPath);

    if ($dropTarget.length === 0) {
      throw `There are no drop targets by the given selector: '${dropCssPath}'`;
    }

    Ember.run(() => {
      triggerEvent($dropTarget, 'dragover', _dataTransfer.default.makeMockEvent());
    });

    Ember.run(() => {
      triggerEvent($dropTarget, 'drop', _dataTransfer.default.makeMockEvent(dragEvent.dataTransfer.get('data.payload')));
    });

    Ember.run(() => {
      triggerEvent($dragHandle, 'dragend', _dataTransfer.default.makeMockEvent());
    });
  } /* global triggerEvent , andThen */
  function drag(cssPath, options = {}) {
    let dragEvent = _dataTransfer.default.makeMockEvent();
    let $dragHandle = Ember.$(cssPath);

    Ember.run(() => {
      triggerEvent($dragHandle, 'mouseover');
    });

    Ember.run(() => {
      triggerEvent($dragHandle, 'dragstart', dragEvent);
    });

    andThen(function () {
      if (options.beforeDrop) {
        options.beforeDrop.call();
      }
    });

    andThen(function () {
      if (options.drop) {
        drop($dragHandle, options.drop, dragEvent);
      }
    });
  }
});
define('ghost-admin/tests/helpers/ember-power-calendar', ['exports', 'moment', 'ember-native-dom-helpers', 'ember-test-helpers/wait'], function (exports, _moment, _emberNativeDomHelpers, _wait) {
  'use strict';

  Object.defineProperty(exports, "__esModule", {
    value: true
  });

  exports.default = function () {
    Ember.Test.registerAsyncHelper('calendarCenter', async function (app, selector, newCenter) {
      Ember.assert('`calendarCenter` expect a Date or MomentJS object as second argument', newCenter);
      let calendarComponent = findComponentInstance(app, selector);
      let onCenterChange = calendarComponent.get('onCenterChange');
      Ember.assert('You cannot call `calendarCenter` on a component that doesn\'t has an `onCenterChange` action', !!onCenterChange);
      let publicAPI = calendarComponent.get('publicAPI');
      await publicAPI.actions.changeCenter(newCenter, publicAPI);
      return (0, _wait.default)();
    });

    Ember.Test.registerAsyncHelper('calendarSelect', async function (app, selector, selected) {
      Ember.assert('`calendarSelect` expect a Date or MomentJS object as second argument', selected);
      let selectedMoment = (0, _moment.default)(selected);
      let calendarElement = findCalendarElement(selector);
      let daySelector = `${selector} [data-date="${selectedMoment.format('YYYY-MM-DD')}"]`;
      let dayElement = (0, _emberNativeDomHelpers.find)(daySelector, calendarElement);
      if (!dayElement) {
        await calendarCenter(selector, selected);
      }
      return (0, _emberNativeDomHelpers.click)(daySelector);
    });
  };

  function findCalendarElement(selector) {
    let target = (0, _emberNativeDomHelpers.find)(selector);
    if (target) {
      if (target.classList.contains('ember-power-calendar')) {
        return target;
      } else {
        return (0, _emberNativeDomHelpers.find)('.ember-power-calendar', target) || (0, _emberNativeDomHelpers.find)('[data-power-calendar-id]', target);
      }
    }
  }

  function findCalendarGuid(selector) {
    let maybeCalendar = findCalendarElement(selector);
    if (!maybeCalendar) {
      return;
    }
    if (maybeCalendar.classList.contains('ember-power-calendar')) {
      return maybeCalendar.id;
    } else {
      return maybeCalendar.attributes['data-power-calendar-id'].value;
    }
  }

  function findComponentInstance(app, selector) {
    let calendarGuid = findCalendarGuid(selector);
    Ember.assert(`Could not find a calendar using selector: "${selector}"`, calendarGuid);
    let calendarService = app.__container__.lookup('service:power-calendar');
    return calendarService._calendars[calendarGuid];
  }
});
define('ghost-admin/tests/helpers/ember-power-datepicker', ['exports', 'ghost-admin/tests/helpers/ember-basic-dropdown', 'ghost-admin/tests/helpers/ember-power-calendar'], function (exports, _emberBasicDropdown, _emberPowerCalendar) {
  'use strict';

  Object.defineProperty(exports, "__esModule", {
    value: true
  });

  exports.default = function () {
    (0, _emberBasicDropdown.default)();
    (0, _emberPowerCalendar.default)();

    Ember.Test.registerAsyncHelper('datepickerSelect', function (app, selector, selected) {
      Ember.assert('`datepickerSelect` expect a Date or MomentJS object as second argument', selected);
      let $selector = find(selector);
      Ember.assert('`datepickerSelect` couln\'t find any element with selector: ' + selector, $selector.length);
      let $trigger;
      if ($selector.hasClass('ember-power-datepicker-trigger')) {
        $trigger = $selector;
      } else {
        $trigger = find(`${selector} .ember-power-datepicker-trigger`);
        Ember.assert('`datepickerSelect` couln\'t find any datepicker within the selector ' + selector, $trigger.length);
        selector = `${selector} .ember-power-datepicker-trigger`;
      }

      clickDropdown(selector);

      andThen(function () {
        calendarSelect('.ember-power-datepicker-content', selected);
      });
    });
  };
});
define('ghost-admin/tests/helpers/ember-power-select', ['exports', 'ember-power-select/test-support/helpers'], function (exports, _helpers) {
  'use strict';

  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.selectChoose = exports.touchTrigger = exports.nativeTouch = exports.clickTrigger = exports.typeInSearch = exports.triggerKeydown = exports.nativeMouseUp = exports.nativeMouseDown = exports.findContains = undefined;
  exports.default = deprecatedRegisterHelpers;


  function deprecateHelper(fn, name) {
    return function (...args) {
      (true && !(false) && Ember.deprecate(`DEPRECATED \`import { ${name} } from '../../tests/helpers/ember-power-select';\` is deprecated. Please, replace it with \`import { ${name} } from 'ember-power-select/test-support/helpers';\``, false, { until: '1.11.0', id: `ember-power-select-test-support-${name}` }));

      return fn(...args);
    };
  }

  let findContains = deprecateHelper(_helpers.findContains, 'findContains');
  let nativeMouseDown = deprecateHelper(_helpers.nativeMouseDown, 'nativeMouseDown');
  let nativeMouseUp = deprecateHelper(_helpers.nativeMouseUp, 'nativeMouseUp');
  let triggerKeydown = deprecateHelper(_helpers.triggerKeydown, 'triggerKeydown');
  let typeInSearch = deprecateHelper(_helpers.typeInSearch, 'typeInSearch');
  let clickTrigger = deprecateHelper(_helpers.clickTrigger, 'clickTrigger');
  let nativeTouch = deprecateHelper(_helpers.nativeTouch, 'nativeTouch');
  let touchTrigger = deprecateHelper(_helpers.touchTrigger, 'touchTrigger');
  let selectChoose = deprecateHelper(_helpers.selectChoose, 'selectChoose');

  function deprecatedRegisterHelpers() {
    (true && !(false) && Ember.deprecate("DEPRECATED `import registerPowerSelectHelpers from '../../tests/helpers/ember-power-select';` is deprecated. Please, replace it with `import registerPowerSelectHelpers from 'ember-power-select/test-support/helpers';`", false, { until: '1.11.0', id: 'ember-power-select-test-support-register-helpers' }));

    return (0, _helpers.default)();
  }

  exports.findContains = findContains;
  exports.nativeMouseDown = nativeMouseDown;
  exports.nativeMouseUp = nativeMouseUp;
  exports.triggerKeydown = triggerKeydown;
  exports.typeInSearch = typeInSearch;
  exports.clickTrigger = clickTrigger;
  exports.nativeTouch = nativeTouch;
  exports.touchTrigger = touchTrigger;
  exports.selectChoose = selectChoose;
});
define('ghost-admin/tests/helpers/ember-simple-auth', ['exports', 'ember-simple-auth/authenticators/test'], function (exports, _test) {
  'use strict';

  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.authenticateSession = authenticateSession;
  exports.currentSession = currentSession;
  exports.invalidateSession = invalidateSession;


  const TEST_CONTAINER_KEY = 'authenticator:test';

  function ensureAuthenticator(app, container) {
    const authenticator = container.lookup(TEST_CONTAINER_KEY);
    if (!authenticator) {
      app.register(TEST_CONTAINER_KEY, _test.default);
    }
  }

  function authenticateSession(app, sessionData) {
    const container = app.__container__;

    const session = container.lookup('service:session');
    ensureAuthenticator(app, container);
    session.authenticate(TEST_CONTAINER_KEY, sessionData);
    return app.testHelpers.wait();
  }

  function currentSession(app) {
    return app.__container__.lookup('service:session');
  }

  function invalidateSession(app) {
    const session = app.__container__.lookup('service:session');
    if (session.get('isAuthenticated')) {
      session.invalidate();
    }
    return app.testHelpers.wait();
  }
});
define('ghost-admin/tests/helpers/file-upload', ['exports'], function (exports) {
    'use strict';

    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.createFile = createFile;
    exports.fileUpload = fileUpload;
    /* global Blob */
    function createFile(content = ['test'], options = {}) {
        let name = options.name,
            type = options.type;


        let file = new Blob(content, { type: type ? type : 'text/plain' });
        file.name = name ? name : 'test.txt';

        return file;
    }

    function fileUpload($element, content, options) {
        let file = createFile(content, options);
        // eslint-disable-next-line new-cap
        let event = Ember.$.Event('change', {
            testingFiles: [file]
        });

        $element.trigger(event);
    }

    exports.default = Ember.Test.registerAsyncHelper('fileUpload', function (app, selector, content, options) {
        let file = createFile(content, options);

        return triggerEvent(selector, 'change', { testingFiles: [file] });
    });
});
define('ghost-admin/tests/helpers/mock-event', ['exports'], function (exports) {
  'use strict';

  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.createDomEvent = createDomEvent;
  class DataTransfer {
    constructor() {
      this.data = {};
    }

    setData(type, value) {
      this.data[type] = value;
      return this;
    }

    getData(type = "Text") {
      return this.data[type];
    }

    setDragImage() {}
  }

  class MockEvent {
    constructor(options = {}) {
      this.dataTransfer = new DataTransfer();
      this.dataTransfer.setData('Text', options.dataTransferData);
      this.originalEvent = this;
      this.setProperties(options);
    }

    useDataTransferData(otherEvent) {
      this.dataTransfer.setData('Text', otherEvent.dataTransfer.getData());
      return this;
    }

    setProperties(props) {
      for (let prop in props) {
        this[prop] = props[prop];
      }
      return this;
    }

    preventDefault() {}

    stopPropagation() {}
  }

  exports.default = MockEvent;
  function createDomEvent(type) {
    let event = document.createEvent("CustomEvent");
    event.initCustomEvent(type, true, true, null);
    event.dataTransfer = new DataTransfer();
    return event;
  }
});
define('ghost-admin/tests/helpers/resolver', ['exports', 'ghost-admin/resolver', 'ghost-admin/config/environment'], function (exports, _resolver, _environment) {
    'use strict';

    Object.defineProperty(exports, "__esModule", {
        value: true
    });


    const resolver = _resolver.default.create();

    resolver.namespace = {
        modulePrefix: _environment.default.modulePrefix,
        podModulePrefix: _environment.default.podModulePrefix
    };

    exports.default = resolver;
});
define('ghost-admin/tests/helpers/start-app', ['exports', 'ghost-admin/app', 'ghost-admin/config/environment', 'ghost-admin/tests/helpers/file-upload', 'ghost-admin/tests/helpers/ember-power-datepicker', 'ember-power-select/test-support/helpers'], function (exports, _app, _environment, _fileUpload, _emberPowerDatepicker, _helpers) {
    'use strict';

    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.default = startApp;
    // eslint-disable-line
    (0, _helpers.default)();
    (0, _emberPowerDatepicker.default)();

    function startApp(attrs) {
        let attributes = Ember.assign({}, _environment.default.APP);
        attributes = Ember.assign(attributes, attrs); // use defaults, but you can override;

        return Ember.run(() => {
            let application = _app.default.create(attributes);
            application.setupForTesting();
            application.injectTestHelpers();
            return application;
        });
    }
});
define('ghost-admin/tests/integration/adapters/tag-test', ['pretender', 'mocha', 'chai', 'ember-mocha'], function (_pretender, _mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Adapter: tag', function () {
        (0, _emberMocha.setupTest)('adapter:tag', {
            integration: true
        });

        let server, store;

        beforeEach(function () {
            store = this.container.lookup('service:store');
            server = new _pretender.default();
        });

        afterEach(function () {
            server.shutdown();
        });

        (0, _mocha.it)('loads tags from regular endpoint when all are fetched', function (done) {
            server.get('/ghost/api/v0.1/tags/', function () {
                return [200, { 'Content-Type': 'application/json' }, JSON.stringify({ tags: [{
                        id: 1,
                        name: 'Tag 1',
                        slug: 'tag-1'
                    }, {
                        id: 2,
                        name: 'Tag 2',
                        slug: 'tag-2'
                    }] })];
            });

            store.findAll('tag', { reload: true }).then(tags => {
                (0, _chai.expect)(tags).to.be.ok;
                (0, _chai.expect)(tags.objectAtContent(0).get('name')).to.equal('Tag 1');
                done();
            });
        });

        (0, _mocha.it)('loads tag from slug endpoint when single tag is queried and slug is passed in', function (done) {
            server.get('/ghost/api/v0.1/tags/slug/tag-1/', function () {
                return [200, { 'Content-Type': 'application/json' }, JSON.stringify({ tags: [{
                        id: 1,
                        slug: 'tag-1',
                        name: 'Tag 1'
                    }] })];
            });

            store.queryRecord('tag', { slug: 'tag-1' }).then(tag => {
                (0, _chai.expect)(tag).to.be.ok;
                (0, _chai.expect)(tag.get('name')).to.equal('Tag 1');
                done();
            });
        });
    });
});
define('ghost-admin/tests/integration/adapters/user-test', ['pretender', 'mocha', 'chai', 'ember-mocha'], function (_pretender, _mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Adapter: user', function () {
        (0, _emberMocha.setupTest)('adapter:user', {
            integration: true
        });

        let server, store;

        beforeEach(function () {
            store = this.container.lookup('service:store');
            server = new _pretender.default();
        });

        afterEach(function () {
            server.shutdown();
        });

        (0, _mocha.it)('loads users from regular endpoint when all are fetched', function (done) {
            server.get('/ghost/api/v0.1/users/', function () {
                return [200, { 'Content-Type': 'application/json' }, JSON.stringify({ users: [{
                        id: 1,
                        name: 'User 1',
                        slug: 'user-1'
                    }, {
                        id: 2,
                        name: 'User 2',
                        slug: 'user-2'
                    }] })];
            });

            store.findAll('user', { reload: true }).then(users => {
                (0, _chai.expect)(users).to.be.ok;
                (0, _chai.expect)(users.objectAtContent(0).get('name')).to.equal('User 1');
                done();
            });
        });

        (0, _mocha.it)('loads user from slug endpoint when single user is queried and slug is passed in', function (done) {
            server.get('/ghost/api/v0.1/users/slug/user-1/', function () {
                return [200, { 'Content-Type': 'application/json' }, JSON.stringify({ users: [{
                        id: 1,
                        slug: 'user-1',
                        name: 'User 1'
                    }] })];
            });

            store.queryRecord('user', { slug: 'user-1' }).then(user => {
                (0, _chai.expect)(user).to.be.ok;
                (0, _chai.expect)(user.get('name')).to.equal('User 1');
                done();
            });
        });

        (0, _mocha.it)('handles "include" parameter when querying single user via slug', function (done) {
            server.get('/ghost/api/v0.1/users/slug/user-1/', request => {
                let params = request.queryParams;
                (0, _chai.expect)(params.include, 'include query').to.equal('roles,count.posts');

                return [200, { 'Content-Type': 'application/json' }, JSON.stringify({ users: [{
                        id: 1,
                        slug: 'user-1',
                        name: 'User 1',
                        count: {
                            posts: 5
                        }
                    }] })];
            });

            store.queryRecord('user', { slug: 'user-1', include: 'count.posts' }).then(user => {
                (0, _chai.expect)(user).to.be.ok;
                (0, _chai.expect)(user.get('name')).to.equal('User 1');
                (0, _chai.expect)(user.get('count.posts')).to.equal(5);
                done();
            });
        });
    });
});
define('ghost-admin/tests/integration/components/gh-alert-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
        'use strict';

        (0, _mocha.describe)('Integration: Component: gh-alert', function () {
                (0, _emberMocha.setupComponentTest)('gh-alert', {
                        integration: true
                });

                (0, _mocha.it)('renders', function () {
                        this.set('message', { message: 'Test message', type: 'success' });

                        this.render(Ember.HTMLBars.template({
                                "id": "uwV/upqO",
                                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-alert\",null,[[\"message\"],[[22,[\"message\"]]]]],false]],\"hasEval\":false}",
                                "meta": {}
                        }));

                        (0, _chai.expect)(this.$('article.gh-alert')).to.have.length(1);
                        let $alert = this.$('.gh-alert');

                        (0, _chai.expect)($alert.text()).to.match(/Test message/);
                });

                (0, _mocha.it)('maps message types to CSS classes', function () {
                        this.set('message', { message: 'Test message', type: 'success' });

                        this.render(Ember.HTMLBars.template({
                                "id": "uwV/upqO",
                                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-alert\",null,[[\"message\"],[[22,[\"message\"]]]]],false]],\"hasEval\":false}",
                                "meta": {}
                        }));
                        let $alert = this.$('.gh-alert');

                        this.set('message.type', 'success');
                        (0, _chai.expect)($alert.hasClass('gh-alert-green'), 'success class isn\'t green').to.be.true;

                        this.set('message.type', 'error');
                        (0, _chai.expect)($alert.hasClass('gh-alert-red'), 'success class isn\'t red').to.be.true;

                        this.set('message.type', 'warn');
                        (0, _chai.expect)($alert.hasClass('gh-alert-blue'), 'success class isn\'t yellow').to.be.true;

                        this.set('message.type', 'info');
                        (0, _chai.expect)($alert.hasClass('gh-alert-blue'), 'success class isn\'t blue').to.be.true;
                });
        });
});
define('ghost-admin/tests/integration/components/gh-alerts-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    let notificationsStub = Ember.Service.extend({
        alerts: Ember.A()
    });

    (0, _mocha.describe)('Integration: Component: gh-alerts', function () {
        (0, _emberMocha.setupComponentTest)('gh-alerts', {
            integration: true
        });

        beforeEach(function () {
            this.register('service:notifications', notificationsStub);
            this.inject.service('notifications', { as: 'notifications' });

            this.set('notifications.alerts', [{ message: 'First', type: 'error' }, { message: 'Second', type: 'warn' }]);
        });

        (0, _mocha.it)('renders', function () {
            this.render(Ember.HTMLBars.template({
                "id": "CXE0uR1F",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"gh-alerts\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$('.gh-alerts').length).to.equal(1);
            (0, _chai.expect)(this.$('.gh-alerts').children().length).to.equal(2);

            this.set('notifications.alerts', Ember.A());
            (0, _chai.expect)(this.$('.gh-alerts').children().length).to.equal(0);
        });

        (0, _mocha.it)('triggers "notify" action when message count changes', function () {
            let expectedCount = 0;

            // test double for notify action
            this.set('notify', count => (0, _chai.expect)(count).to.equal(expectedCount));

            this.render(Ember.HTMLBars.template({
                "id": "Pf9Jd2ag",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-alerts\",null,[[\"notify\"],[[26,\"action\",[[21,0,[]],[22,[\"notify\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            expectedCount = 3;
            this.get('notifications.alerts').pushObject({ message: 'Third', type: 'success' });

            expectedCount = 0;
            this.set('notifications.alerts', Ember.A());
        });
    });
});
define('ghost-admin/tests/integration/components/gh-basic-dropdown-test', ['ghost-admin/tests/helpers/ember-basic-dropdown', 'mocha', 'chai', 'ember-native-dom-helpers', 'ember-mocha'], function (_emberBasicDropdown, _mocha, _chai, _emberNativeDomHelpers, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: gh-basic-dropdown', function () {
        (0, _emberMocha.setupComponentTest)('gh-basic-dropdown', {
            integration: true
        });

        (0, _mocha.it)('closes when dropdown service fires close event', function () {
            let dropdownService = this.container.lookup('service:dropdown');

            this.render(Ember.HTMLBars.template({
                "id": "OjKClslJ",
                "block": "{\"symbols\":[\"dropdown\"],\"statements\":[[0,\"\\n\"],[4,\"gh-basic-dropdown\",null,null,{\"statements\":[[0,\"                \"],[6,\"button\"],[10,\"class\",\"ember-basic-dropdown-trigger\"],[11,\"onclick\",[21,1,[\"actions\",\"toggle\"]],null],[8],[9],[0,\"\\n\"],[4,\"if\",[[21,1,[\"isOpen\"]]],null,{\"statements\":[[0,\"                    \"],[6,\"div\"],[10,\"id\",\"dropdown-is-opened\"],[8],[9],[0,\"\\n\"]],\"parameters\":[]},null]],\"parameters\":[1]},null],[0,\"        \"]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _emberBasicDropdown.clickTrigger)();
            (0, _chai.expect)(Ember.$((0, _emberNativeDomHelpers.find)('#dropdown-is-opened'))).to.exist;

            Ember.run(() => {
                dropdownService.closeDropdowns();
            });

            (0, _chai.expect)(Ember.$((0, _emberNativeDomHelpers.find)('#dropdown-is-opened'))).to.not.exist;
        });
    });
});
define('ghost-admin/tests/integration/components/gh-cm-editor-test', ['ember-test-helpers/wait', 'ember-native-dom-helpers', 'mocha', 'chai', 'ember-mocha'], function (_wait, _emberNativeDomHelpers, _mocha, _chai, _emberMocha) {
    'use strict';

    // NOTE: If the browser window is not focused/visible CodeMirror (or Chrome?) will
    // take longer to respond to/fire events so it's possible that some of these tests
    // will take 1-3 seconds

    (0, _mocha.describe)('Integration: Component: gh-cm-editor', function () {
        (0, _emberMocha.setupComponentTest)('gh-cm-editor', {
            integration: true
        });

        (0, _mocha.it)('handles change event', function () {
            this.set('text', '');

            this.render(Ember.HTMLBars.template({
                "id": "WFizN+ax",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-cm-editor\",[[22,[\"text\"]]],[[\"class\",\"update\"],[\"gh-input\",[26,\"action\",[[21,0,[]],[26,\"mut\",[[22,[\"text\"]]],null]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            // access CodeMirror directly as it doesn't pick up changes to the textarea
            let cm = (0, _emberNativeDomHelpers.find)('.gh-input .CodeMirror').CodeMirror;
            cm.setValue('Testing');

            return (0, _wait.default)().then(() => {
                (0, _chai.expect)(this.get('text'), 'text value after CM editor change').to.equal('Testing');
            });
        });

        (0, _mocha.it)('handles focus event', function (done) {
            // CodeMirror's events are triggered outside of anything we can watch for
            // in the tests so let's run the class check when we know the event has
            // been fired and timeout if it's not fired as we expect
            let onFocus = () => {
                // wait for runloop to finish so that the new class has been rendered
                (0, _wait.default)().then(() => {
                    (0, _chai.expect)(Ember.$((0, _emberNativeDomHelpers.find)('.gh-input')).hasClass('focus'), 'has focused class on first render with autofocus').to.be.true;

                    done();
                });
            };

            this.set('onFocus', onFocus);
            this.set('text', '');

            this.render(Ember.HTMLBars.template({
                "id": "8k+dsWOg",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-cm-editor\",[[22,[\"text\"]]],[[\"class\",\"update\",\"focus-in\"],[\"gh-input\",[26,\"action\",[[21,0,[]],[26,\"mut\",[[22,[\"text\"]]],null]],null],[26,\"action\",[[21,0,[]],[22,[\"onFocus\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            // CodeMirror polls the input for changes every 100ms
            (0, _emberNativeDomHelpers.click)('textarea');
            (0, _emberNativeDomHelpers.triggerEvent)('textarea', 'focus');
        });

        (0, _mocha.it)('handles blur event', async function () {
            this.set('text', '');
            this.render(Ember.HTMLBars.template({
                "id": "WFizN+ax",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-cm-editor\",[[22,[\"text\"]]],[[\"class\",\"update\"],[\"gh-input\",[26,\"action\",[[21,0,[]],[26,\"mut\",[[22,[\"text\"]]],null]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _chai.expect)(Ember.$((0, _emberNativeDomHelpers.find)('.gh-input')).hasClass('focus')).to.be.false;

            await (0, _emberNativeDomHelpers.click)('textarea');
            await (0, _emberNativeDomHelpers.triggerEvent)('textarea', 'focus');

            (0, _chai.expect)(Ember.$((0, _emberNativeDomHelpers.find)('.gh-input')).hasClass('focus')).to.be.true;

            await (0, _emberNativeDomHelpers.triggerEvent)('textarea', 'blur');

            (0, _chai.expect)(Ember.$((0, _emberNativeDomHelpers.find)('.gh-input')).hasClass('focus')).to.be.false;
        });

        (0, _mocha.it)('can autofocus', function (done) {
            // CodeMirror's events are triggered outside of anything we can watch for
            // in the tests so let's run the class check when we know the event has
            // been fired and timeout if it's not fired as we expect
            let onFocus = () => {
                // wait for runloop to finish so that the new class has been rendered
                (0, _wait.default)().then(() => {
                    (0, _chai.expect)(this.$('.gh-input').hasClass('focus'), 'has focused class on first render with autofocus').to.be.true;

                    done();
                });
            };

            this.set('onFocus', onFocus);
            this.set('text', '');

            this.render(Ember.HTMLBars.template({
                "id": "Fio2C7Zw",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-cm-editor\",[[22,[\"text\"]]],[[\"class\",\"update\",\"autofocus\",\"focus-in\"],[\"gh-input\",[26,\"action\",[[21,0,[]],[26,\"mut\",[[22,[\"text\"]]],null]],null],true,[26,\"action\",[[21,0,[]],[22,[\"onFocus\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
        });
    });
});
define('ghost-admin/tests/integration/components/gh-date-time-picker-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: gh-date-time-picker', function () {
        (0, _emberMocha.setupComponentTest)('gh-date-time-picker', {
            integration: true
        });

        _mocha.it.skip('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#gh-date-time-picker}}
            //     template content
            //   {{/gh-date-time-picker}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "aKflaLLc",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"gh-date-time-picker\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/gh-download-count-test', ['pretender', 'ember-test-helpers/wait', 'mocha', 'chai', 'ember-mocha'], function (_pretender, _wait, _mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: gh-download-count', function () {
        (0, _emberMocha.setupComponentTest)('gh-download-count', {
            integration: true
        });

        let server;

        beforeEach(function () {
            server = new _pretender.default();
            server.get('https://count.ghost.org/', function () {
                return [200, {}, JSON.stringify({ count: 42 })];
            });
        });

        afterEach(function () {
            server.shutdown();
        });

        (0, _mocha.it)('hits count endpoint and renders', function () {
            this.render(Ember.HTMLBars.template({
                "id": "WsUELRyd",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"gh-download-count\"],false]],\"hasEval\":false}",
                "meta": {}
            }));

            return (0, _wait.default)().then(() => {
                (0, _chai.expect)(this.$().text().trim()).to.equal('42');
            });
        });

        (0, _mocha.it)('renders with a block', function () {
            this.render(Ember.HTMLBars.template({
                "id": "adB0Ta0A",
                "block": "{\"symbols\":[\"count\"],\"statements\":[[0,\"\\n\"],[4,\"gh-download-count\",null,null,{\"statements\":[[0,\"                \"],[1,[21,1,[]],false],[0,\" downloads\\n\"]],\"parameters\":[1]},null],[0,\"        \"]],\"hasEval\":false}",
                "meta": {}
            }));

            return (0, _wait.default)().then(() => {
                (0, _chai.expect)(this.$().text().trim()).to.equal('42 downloads');
            });
        });
    });
});
define('ghost-admin/tests/integration/components/gh-editor-post-status-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: gh-editor-post-status', function () {
        (0, _emberMocha.setupComponentTest)('gh-editor-post-status', {
            integration: true
        });

        (0, _mocha.it)('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#gh-editor-post-status}}
            //     template content
            //   {{/gh-editor-post-status}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "sr7gXR/o",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"gh-editor-post-status\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/gh-feature-flag-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    const featureStub = Ember.Service.extend({
        testFlag: true
    });

    (0, _mocha.describe)('Integration: Component: gh-feature-flag', function () {
        (0, _emberMocha.setupComponentTest)('gh-feature-flag', {
            integration: true
        });

        beforeEach(function () {
            this.register('service:feature', featureStub);
            this.inject.service('feature', { as: 'feature' });
        });

        (0, _mocha.it)('renders properties correctly', function () {
            this.render(Ember.HTMLBars.template({
                "id": "3Wiz4TSs",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-feature-flag\",[\"testFlag\"],null],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
            (0, _chai.expect)(this.$('label').attr('for')).to.equal(this.$('input[type="checkbox"]').attr('id'));
        });

        (0, _mocha.it)('renders correctly when flag is set to true', function () {
            this.render(Ember.HTMLBars.template({
                "id": "3Wiz4TSs",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-feature-flag\",[\"testFlag\"],null],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
            (0, _chai.expect)(this.$('label input[type="checkbox"]').prop('checked')).to.be.true;
        });

        (0, _mocha.it)('renders correctly when flag is set to false', function () {
            this.set('feature.testFlag', false);

            this.render(Ember.HTMLBars.template({
                "id": "3Wiz4TSs",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-feature-flag\",[\"testFlag\"],null],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);

            (0, _chai.expect)(this.$('label input[type="checkbox"]').prop('checked')).to.be.false;
        });

        (0, _mocha.it)('updates to reflect changes in flag property', function () {
            this.render(Ember.HTMLBars.template({
                "id": "3Wiz4TSs",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-feature-flag\",[\"testFlag\"],null],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);

            (0, _chai.expect)(this.$('label input[type="checkbox"]').prop('checked')).to.be.true;

            this.$('label').click();

            (0, _chai.expect)(this.$('label input[type="checkbox"]').prop('checked')).to.be.false;
        });
    });
});
define('ghost-admin/tests/integration/components/gh-file-uploader-test', ['pretender', 'sinon', 'ember-test-helpers/wait', 'ghost-admin/services/ajax', 'ghost-admin/tests/helpers/file-upload', 'mocha', 'chai', 'ember-mocha'], function (_pretender, _sinon, _wait, _ajax, _fileUpload, _mocha, _chai, _emberMocha) {
    'use strict';

    var _slicedToArray = function () {
        function sliceIterator(arr, i) {
            var _arr = [];
            var _n = true;
            var _d = false;
            var _e = undefined;

            try {
                for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
                    _arr.push(_s.value);

                    if (i && _arr.length === i) break;
                }
            } catch (err) {
                _d = true;
                _e = err;
            } finally {
                try {
                    if (!_n && _i["return"]) _i["return"]();
                } finally {
                    if (_d) throw _e;
                }
            }

            return _arr;
        }

        return function (arr, i) {
            if (Array.isArray(arr)) {
                return arr;
            } else if (Symbol.iterator in Object(arr)) {
                return sliceIterator(arr, i);
            } else {
                throw new TypeError("Invalid attempt to destructure non-iterable instance");
            }
        };
    }();

    const notificationsStub = Ember.Service.extend({
        showAPIError() {
            // noop - to be stubbed
        }
    });

    const stubSuccessfulUpload = function stubSuccessfulUpload(server, delay = 0) {
        server.post('/ghost/api/v0.1/uploads/', function () {
            return [200, { 'Content-Type': 'application/json' }, '"/content/images/test.png"'];
        }, delay);
    };

    const stubFailedUpload = function stubFailedUpload(server, code, error, delay = 0) {
        server.post('/ghost/api/v0.1/uploads/', function () {
            return [code, { 'Content-Type': 'application/json' }, JSON.stringify({
                errors: [{
                    errorType: error,
                    message: `Error: ${error}`
                }]
            })];
        }, delay);
    };

    (0, _mocha.describe)('Integration: Component: gh-file-uploader', function () {
        (0, _emberMocha.setupComponentTest)('gh-file-uploader', {
            integration: true
        });

        let server;

        beforeEach(function () {
            server = new _pretender.default();
            this.set('uploadUrl', '/ghost/api/v0.1/uploads/');

            this.register('service:notifications', notificationsStub);
            this.inject.service('notifications', { as: 'notifications' });
        });

        afterEach(function () {
            server.shutdown();
        });

        (0, _mocha.it)('renders', function () {
            this.render(Ember.HTMLBars.template({
                "id": "6Y/tJGEy",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"gh-file-uploader\"],false]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _chai.expect)(this.$('label').text().trim(), 'default label').to.equal('Select or drag-and-drop a file');
        });

        (0, _mocha.it)('allows file input "accept" attribute to be changed', function () {
            this.render(Ember.HTMLBars.template({
                "id": "6Y/tJGEy",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"gh-file-uploader\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$('input[type="file"]').attr('accept'), 'default "accept" attribute').to.equal('text/csv');

            this.render(Ember.HTMLBars.template({
                "id": "I1+j5tID",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-file-uploader\",null,[[\"accept\"],[\"application/zip\"]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$('input[type="file"]').attr('accept'), 'specified "accept" attribute').to.equal('application/zip');
        });

        (0, _mocha.it)('renders form with supplied label text', function () {
            this.set('labelText', 'My label');
            this.render(Ember.HTMLBars.template({
                "id": "agRgo35P",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-file-uploader\",null,[[\"labelText\"],[[22,[\"labelText\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _chai.expect)(this.$('label').text().trim(), 'label').to.equal('My label');
        });

        (0, _mocha.it)('generates request to supplied endpoint', function (done) {
            stubSuccessfulUpload(server);

            this.render(Ember.HTMLBars.template({
                "id": "PP+DLmYw",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-file-uploader\",null,[[\"url\"],[[22,[\"uploadUrl\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.csv' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(server.handledRequests.length).to.equal(1);
                (0, _chai.expect)(server.handledRequests[0].url).to.equal('/ghost/api/v0.1/uploads/');
                done();
            });
        });

        (0, _mocha.it)('fires uploadSuccess action on successful upload', function (done) {
            let uploadSuccess = _sinon.default.spy();
            this.set('uploadSuccess', uploadSuccess);

            stubSuccessfulUpload(server);

            this.render(Ember.HTMLBars.template({
                "id": "kpC3rh6i",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-file-uploader\",null,[[\"url\",\"uploadSuccess\"],[[22,[\"uploadUrl\"]],[26,\"action\",[[21,0,[]],[22,[\"uploadSuccess\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.csv' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(uploadSuccess.calledOnce).to.be.true;
                (0, _chai.expect)(uploadSuccess.firstCall.args[0]).to.equal('/content/images/test.png');
                done();
            });
        });

        (0, _mocha.it)('doesn\'t fire uploadSuccess action on failed upload', function (done) {
            let uploadSuccess = _sinon.default.spy();
            this.set('uploadSuccess', uploadSuccess);

            stubFailedUpload(server, 500);

            this.render(Ember.HTMLBars.template({
                "id": "kpC3rh6i",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-file-uploader\",null,[[\"url\",\"uploadSuccess\"],[[22,[\"uploadUrl\"]],[26,\"action\",[[21,0,[]],[22,[\"uploadSuccess\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.csv' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(uploadSuccess.calledOnce).to.be.false;
                done();
            });
        });

        (0, _mocha.it)('fires fileSelected action on file selection', function (done) {
            let fileSelected = _sinon.default.spy();
            this.set('fileSelected', fileSelected);

            stubSuccessfulUpload(server);

            this.render(Ember.HTMLBars.template({
                "id": "7sV26EGl",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-file-uploader\",null,[[\"url\",\"fileSelected\"],[[22,[\"uploadUrl\"]],[26,\"action\",[[21,0,[]],[22,[\"fileSelected\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.csv' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(fileSelected.calledOnce).to.be.true;
                (0, _chai.expect)(fileSelected.args[0]).to.not.be.empty;
                done();
            });
        });

        (0, _mocha.it)('fires uploadStarted action on upload start', function (done) {
            let uploadStarted = _sinon.default.spy();
            this.set('uploadStarted', uploadStarted);

            stubSuccessfulUpload(server);

            this.render(Ember.HTMLBars.template({
                "id": "Y7ijQSKh",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-file-uploader\",null,[[\"url\",\"uploadStarted\"],[[22,[\"uploadUrl\"]],[26,\"action\",[[21,0,[]],[22,[\"uploadStarted\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.csv' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(uploadStarted.calledOnce).to.be.true;
                done();
            });
        });

        (0, _mocha.it)('fires uploadFinished action on successful upload', function (done) {
            let uploadFinished = _sinon.default.spy();
            this.set('uploadFinished', uploadFinished);

            stubSuccessfulUpload(server);

            this.render(Ember.HTMLBars.template({
                "id": "p7DBXp62",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-file-uploader\",null,[[\"url\",\"uploadFinished\"],[[22,[\"uploadUrl\"]],[26,\"action\",[[21,0,[]],[22,[\"uploadFinished\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.csv' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(uploadFinished.calledOnce).to.be.true;
                done();
            });
        });

        (0, _mocha.it)('fires uploadFinished action on failed upload', function (done) {
            let uploadFinished = _sinon.default.spy();
            this.set('uploadFinished', uploadFinished);

            stubFailedUpload(server);

            this.render(Ember.HTMLBars.template({
                "id": "p7DBXp62",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-file-uploader\",null,[[\"url\",\"uploadFinished\"],[[22,[\"uploadUrl\"]],[26,\"action\",[[21,0,[]],[22,[\"uploadFinished\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.csv' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(uploadFinished.calledOnce).to.be.true;
                done();
            });
        });

        (0, _mocha.it)('displays invalid file type error', function (done) {
            stubFailedUpload(server, 415, 'UnsupportedMediaTypeError');
            this.render(Ember.HTMLBars.template({
                "id": "PP+DLmYw",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-file-uploader\",null,[[\"url\"],[[22,[\"uploadUrl\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.csv' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(this.$('.failed').length, 'error message is displayed').to.equal(1);
                (0, _chai.expect)(this.$('.failed').text()).to.match(/The file type you uploaded is not supported/);
                (0, _chai.expect)(this.$('.gh-btn-green').length, 'reset button is displayed').to.equal(1);
                (0, _chai.expect)(this.$('.gh-btn-green').text()).to.equal('Try Again');
                done();
            });
        });

        (0, _mocha.it)('displays file too large for server error', function (done) {
            stubFailedUpload(server, 413, 'RequestEntityTooLargeError');
            this.render(Ember.HTMLBars.template({
                "id": "PP+DLmYw",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-file-uploader\",null,[[\"url\"],[[22,[\"uploadUrl\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.csv' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(this.$('.failed').length, 'error message is displayed').to.equal(1);
                (0, _chai.expect)(this.$('.failed').text()).to.match(/The file you uploaded was larger/);
                done();
            });
        });

        (0, _mocha.it)('handles file too large error directly from the web server', function (done) {
            server.post('/ghost/api/v0.1/uploads/', function () {
                return [413, {}, ''];
            });
            this.render(Ember.HTMLBars.template({
                "id": "PP+DLmYw",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-file-uploader\",null,[[\"url\"],[[22,[\"uploadUrl\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.csv' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(this.$('.failed').length, 'error message is displayed').to.equal(1);
                (0, _chai.expect)(this.$('.failed').text()).to.match(/The file you uploaded was larger/);
                done();
            });
        });

        (0, _mocha.it)('displays other server-side error with message', function (done) {
            stubFailedUpload(server, 400, 'UnknownError');
            this.render(Ember.HTMLBars.template({
                "id": "PP+DLmYw",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-file-uploader\",null,[[\"url\"],[[22,[\"uploadUrl\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.csv' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(this.$('.failed').length, 'error message is displayed').to.equal(1);
                (0, _chai.expect)(this.$('.failed').text()).to.match(/Error: UnknownError/);
                done();
            });
        });

        (0, _mocha.it)('handles unknown failure', function (done) {
            server.post('/ghost/api/v0.1/uploads/', function () {
                return [500, { 'Content-Type': 'application/json' }, ''];
            });
            this.render(Ember.HTMLBars.template({
                "id": "PP+DLmYw",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-file-uploader\",null,[[\"url\"],[[22,[\"uploadUrl\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.csv' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(this.$('.failed').length, 'error message is displayed').to.equal(1);
                (0, _chai.expect)(this.$('.failed').text()).to.match(/Something went wrong/);
                done();
            });
        });

        (0, _mocha.it)('triggers notifications.showAPIError for VersionMismatchError', function (done) {
            let showAPIError = _sinon.default.spy();
            this.set('notifications.showAPIError', showAPIError);

            stubFailedUpload(server, 400, 'VersionMismatchError');

            this.render(Ember.HTMLBars.template({
                "id": "PP+DLmYw",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-file-uploader\",null,[[\"url\"],[[22,[\"uploadUrl\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.csv' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(showAPIError.calledOnce).to.be.true;
                done();
            });
        });

        (0, _mocha.it)('doesn\'t trigger notifications.showAPIError for other errors', function (done) {
            let showAPIError = _sinon.default.spy();
            this.set('notifications.showAPIError', showAPIError);

            stubFailedUpload(server, 400, 'UnknownError');
            this.render(Ember.HTMLBars.template({
                "id": "PP+DLmYw",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-file-uploader\",null,[[\"url\"],[[22,[\"uploadUrl\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.csv' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(showAPIError.called).to.be.false;
                done();
            });
        });

        (0, _mocha.it)('can be reset after a failed upload', function (done) {
            stubFailedUpload(server, 400, 'UnknownError');
            this.render(Ember.HTMLBars.template({
                "id": "PP+DLmYw",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-file-uploader\",null,[[\"url\"],[[22,[\"uploadUrl\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.csv' });

            (0, _wait.default)().then(() => {
                Ember.run(() => {
                    this.$('.gh-btn-green').click();
                });
            });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(this.$('input[type="file"]').length).to.equal(1);
                done();
            });
        });

        (0, _mocha.it)('displays upload progress', function (done) {
            this.set('done', done);

            // pretender fires a progress event every 50ms
            stubSuccessfulUpload(server, 150);

            this.render(Ember.HTMLBars.template({
                "id": "fK6uYCvT",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-file-uploader\",null,[[\"url\",\"uploadFinished\"],[[22,[\"uploadUrl\"]],[26,\"action\",[[21,0,[]],[22,[\"done\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.csv' });

            // after 75ms we should have had one progress event
            Ember.run.later(this, function () {
                (0, _chai.expect)(this.$('.progress .bar').length).to.equal(1);

                var _$$attr$match = this.$('.progress .bar').attr('style').match(/width: (\d+)%?/),
                    _$$attr$match2 = _slicedToArray(_$$attr$match, 2);

                let percentageWidth = _$$attr$match2[1];

                percentageWidth = Number.parseInt(percentageWidth);
                (0, _chai.expect)(percentageWidth).to.be.above(0);
                (0, _chai.expect)(percentageWidth).to.be.below(100);
            }, 75);
        });

        (0, _mocha.it)('handles drag over/leave', function () {
            this.render(Ember.HTMLBars.template({
                "id": "6Y/tJGEy",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"gh-file-uploader\"],false]],\"hasEval\":false}",
                "meta": {}
            }));

            Ember.run(() => {
                // eslint-disable-next-line new-cap
                let dragover = Ember.$.Event('dragover', {
                    dataTransfer: {
                        files: []
                    }
                });
                this.$('.gh-image-uploader').trigger(dragover);
            });

            (0, _chai.expect)(this.$('.gh-image-uploader').hasClass('-drag-over'), 'has drag-over class').to.be.true;

            Ember.run(() => {
                this.$('.gh-image-uploader').trigger('dragleave');
            });

            (0, _chai.expect)(this.$('.gh-image-uploader').hasClass('-drag-over'), 'has drag-over class').to.be.false;
        });

        (0, _mocha.it)('triggers file upload on file drop', function (done) {
            let uploadSuccess = _sinon.default.spy();
            // eslint-disable-next-line new-cap
            let drop = Ember.$.Event('drop', {
                dataTransfer: {
                    files: [(0, _fileUpload.createFile)(['test'], { name: 'test.csv' })]
                }
            });

            this.set('uploadSuccess', uploadSuccess);

            stubSuccessfulUpload(server);
            this.render(Ember.HTMLBars.template({
                "id": "kpC3rh6i",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-file-uploader\",null,[[\"url\",\"uploadSuccess\"],[[22,[\"uploadUrl\"]],[26,\"action\",[[21,0,[]],[22,[\"uploadSuccess\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            Ember.run(() => {
                this.$('.gh-image-uploader').trigger(drop);
            });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(uploadSuccess.calledOnce).to.be.true;
                (0, _chai.expect)(uploadSuccess.firstCall.args[0]).to.equal('/content/images/test.png');
                done();
            });
        });

        (0, _mocha.it)('validates extension by default', function (done) {
            let uploadSuccess = _sinon.default.spy();
            let uploadFailed = _sinon.default.spy();

            this.set('uploadSuccess', uploadSuccess);
            this.set('uploadFailed', uploadFailed);

            stubSuccessfulUpload(server);

            this.render(Ember.HTMLBars.template({
                "id": "t1BnhN2j",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-file-uploader\",null,[[\"url\",\"uploadSuccess\",\"uploadFailed\"],[[22,[\"uploadUrl\"]],[26,\"action\",[[21,0,[]],[22,[\"uploadSuccess\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"uploadFailed\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.txt' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(uploadSuccess.called).to.be.false;
                (0, _chai.expect)(uploadFailed.calledOnce).to.be.true;
                (0, _chai.expect)(this.$('.failed').length, 'error message is displayed').to.equal(1);
                (0, _chai.expect)(this.$('.failed').text()).to.match(/The file type you uploaded is not supported/);
                done();
            });
        });

        (0, _mocha.it)('uploads if validate action supplied and returns true', function (done) {
            let validate = _sinon.default.stub().returns(true);
            let uploadSuccess = _sinon.default.spy();

            this.set('validate', validate);
            this.set('uploadSuccess', uploadSuccess);

            stubSuccessfulUpload(server);

            this.render(Ember.HTMLBars.template({
                "id": "5kdLWRN2",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-file-uploader\",null,[[\"url\",\"uploadSuccess\",\"validate\"],[[22,[\"uploadUrl\"]],[26,\"action\",[[21,0,[]],[22,[\"uploadSuccess\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"validate\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.csv' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(validate.calledOnce).to.be.true;
                (0, _chai.expect)(uploadSuccess.calledOnce).to.be.true;
                done();
            });
        });

        (0, _mocha.it)('skips upload and displays error if validate action supplied and doesn\'t return true', function (done) {
            let validate = _sinon.default.stub().returns(new _ajax.UnsupportedMediaTypeError());
            let uploadSuccess = _sinon.default.spy();
            let uploadFailed = _sinon.default.spy();

            this.set('validate', validate);
            this.set('uploadSuccess', uploadSuccess);
            this.set('uploadFailed', uploadFailed);

            stubSuccessfulUpload(server);

            this.render(Ember.HTMLBars.template({
                "id": "3NUxk1hZ",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-file-uploader\",null,[[\"url\",\"uploadSuccess\",\"uploadFailed\",\"validate\"],[[22,[\"uploadUrl\"]],[26,\"action\",[[21,0,[]],[22,[\"uploadSuccess\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"uploadFailed\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"validate\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.csv' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(validate.calledOnce).to.be.true;
                (0, _chai.expect)(uploadSuccess.called).to.be.false;
                (0, _chai.expect)(uploadFailed.calledOnce).to.be.true;
                (0, _chai.expect)(this.$('.failed').length, 'error message is displayed').to.equal(1);
                (0, _chai.expect)(this.$('.failed').text()).to.match(/The file type you uploaded is not supported/);
                done();
            });
        });
    });
});
define('ghost-admin/tests/integration/components/gh-image-uploader-test', ['pretender', 'sinon', 'ember-test-helpers/wait', 'ghost-admin/services/ajax', 'ghost-admin/tests/helpers/file-upload', 'mocha', 'chai', 'ember-mocha'], function (_pretender, _sinon, _wait, _ajax, _fileUpload, _mocha, _chai, _emberMocha) {
    'use strict';

    var _slicedToArray = function () {
        function sliceIterator(arr, i) {
            var _arr = [];
            var _n = true;
            var _d = false;
            var _e = undefined;

            try {
                for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
                    _arr.push(_s.value);

                    if (i && _arr.length === i) break;
                }
            } catch (err) {
                _d = true;
                _e = err;
            } finally {
                try {
                    if (!_n && _i["return"]) _i["return"]();
                } finally {
                    if (_d) throw _e;
                }
            }

            return _arr;
        }

        return function (arr, i) {
            if (Array.isArray(arr)) {
                return arr;
            } else if (Symbol.iterator in Object(arr)) {
                return sliceIterator(arr, i);
            } else {
                throw new TypeError("Invalid attempt to destructure non-iterable instance");
            }
        };
    }();

    const notificationsStub = Ember.Service.extend({
        showAPIError() /* error, options */{
            // noop - to be stubbed
        }
    });

    const sessionStub = Ember.Service.extend({
        isAuthenticated: false,

        init() {
            this._super(...arguments);
            let authenticated = { access_token: 'AccessMe123' };
            this.authenticated = authenticated;
            this.data = { authenticated };
        }
    });

    const stubSuccessfulUpload = function stubSuccessfulUpload(server, delay = 0) {
        server.post('/ghost/api/v0.1/uploads/', function () {
            return [200, { 'Content-Type': 'application/json' }, '"/content/images/test.png"'];
        }, delay);
    };

    const stubFailedUpload = function stubFailedUpload(server, code, error, delay = 0) {
        server.post('/ghost/api/v0.1/uploads/', function () {
            return [code, { 'Content-Type': 'application/json' }, JSON.stringify({
                errors: [{
                    errorType: error,
                    message: `Error: ${error}`
                }]
            })];
        }, delay);
    };

    (0, _mocha.describe)('Integration: Component: gh-image-uploader', function () {
        (0, _emberMocha.setupComponentTest)('gh-image-upload', {
            integration: true
        });

        let server;

        beforeEach(function () {
            this.register('service:session', sessionStub);
            this.register('service:notifications', notificationsStub);
            this.inject.service('session', { as: 'sessionService' });
            this.inject.service('notifications', { as: 'notifications' });
            this.set('update', function () {});
            server = new _pretender.default();
        });

        afterEach(function () {
            server.shutdown();
        });

        (0, _mocha.it)('renders', function () {
            this.set('image', 'http://example.com/test.png');
            this.render(Ember.HTMLBars.template({
                "id": "xrYtL+1/",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"image\"],[[22,[\"image\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });

        (0, _mocha.it)('renders form with supplied alt text', function () {
            this.render(Ember.HTMLBars.template({
                "id": "euwj+L/f",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"image\",\"altText\"],[[22,[\"image\"]],\"text test\"]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$('[data-test-file-input-description]').text().trim()).to.equal('Upload image of "text test"');
        });

        (0, _mocha.it)('renders form with supplied text', function () {
            this.render(Ember.HTMLBars.template({
                "id": "FGs1b2KS",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"image\",\"text\"],[[22,[\"image\"]],\"text test\"]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$('[data-test-file-input-description]').text().trim()).to.equal('text test');
        });

        (0, _mocha.it)('generates request to correct endpoint', function (done) {
            stubSuccessfulUpload(server);

            this.render(Ember.HTMLBars.template({
                "id": "XeIvxrz0",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"image\",\"update\"],[[22,[\"image\"]],[26,\"action\",[[21,0,[]],[22,[\"update\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.png' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(server.handledRequests.length).to.equal(1);
                (0, _chai.expect)(server.handledRequests[0].url).to.equal('/ghost/api/v0.1/uploads/');
                (0, _chai.expect)(server.handledRequests[0].requestHeaders.Authorization).to.be.undefined;
                done();
            });
        });

        (0, _mocha.it)('adds authentication headers to request', function (done) {
            stubSuccessfulUpload(server);

            this.get('sessionService').set('isAuthenticated', true);

            this.render(Ember.HTMLBars.template({
                "id": "XeIvxrz0",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"image\",\"update\"],[[22,[\"image\"]],[26,\"action\",[[21,0,[]],[22,[\"update\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.png' });

            (0, _wait.default)().then(() => {
                var _server$handledReques = _slicedToArray(server.handledRequests, 1);

                let request = _server$handledReques[0];

                (0, _chai.expect)(request.requestHeaders.Authorization).to.equal('Bearer AccessMe123');
                done();
            });
        });

        (0, _mocha.it)('fires update action on successful upload', function (done) {
            let update = _sinon.default.spy();
            this.set('update', update);

            stubSuccessfulUpload(server);

            this.render(Ember.HTMLBars.template({
                "id": "XeIvxrz0",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"image\",\"update\"],[[22,[\"image\"]],[26,\"action\",[[21,0,[]],[22,[\"update\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.png' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(update.calledOnce).to.be.true;
                (0, _chai.expect)(update.firstCall.args[0]).to.equal('/content/images/test.png');
                done();
            });
        });

        (0, _mocha.it)('doesn\'t fire update action on failed upload', function (done) {
            let update = _sinon.default.spy();
            this.set('update', update);

            stubFailedUpload(server, 500);

            this.render(Ember.HTMLBars.template({
                "id": "XeIvxrz0",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"image\",\"update\"],[[22,[\"image\"]],[26,\"action\",[[21,0,[]],[22,[\"update\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.png' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(update.calledOnce).to.be.false;
                done();
            });
        });

        (0, _mocha.it)('fires fileSelected action on file selection', function (done) {
            let fileSelected = _sinon.default.spy();
            this.set('fileSelected', fileSelected);

            stubSuccessfulUpload(server);

            this.render(Ember.HTMLBars.template({
                "id": "6+2KQeYQ",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"image\",\"fileSelected\",\"update\"],[[22,[\"image\"]],[26,\"action\",[[21,0,[]],[22,[\"fileSelected\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"update\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.png' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(fileSelected.calledOnce).to.be.true;
                (0, _chai.expect)(fileSelected.args[0]).to.not.be.empty;
                done();
            });
        });

        (0, _mocha.it)('fires uploadStarted action on upload start', function (done) {
            let uploadStarted = _sinon.default.spy();
            this.set('uploadStarted', uploadStarted);

            stubSuccessfulUpload(server);

            this.render(Ember.HTMLBars.template({
                "id": "sjAjFE10",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"image\",\"uploadStarted\",\"update\"],[[22,[\"image\"]],[26,\"action\",[[21,0,[]],[22,[\"uploadStarted\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"update\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.png' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(uploadStarted.calledOnce).to.be.true;
                done();
            });
        });

        (0, _mocha.it)('fires uploadFinished action on successful upload', function (done) {
            let uploadFinished = _sinon.default.spy();
            this.set('uploadFinished', uploadFinished);

            stubSuccessfulUpload(server);

            this.render(Ember.HTMLBars.template({
                "id": "SczyAV70",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"image\",\"uploadFinished\",\"update\"],[[22,[\"image\"]],[26,\"action\",[[21,0,[]],[22,[\"uploadFinished\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"update\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.png' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(uploadFinished.calledOnce).to.be.true;
                done();
            });
        });

        (0, _mocha.it)('fires uploadFinished action on failed upload', function (done) {
            let uploadFinished = _sinon.default.spy();
            this.set('uploadFinished', uploadFinished);

            stubFailedUpload(server);

            this.render(Ember.HTMLBars.template({
                "id": "SczyAV70",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"image\",\"uploadFinished\",\"update\"],[[22,[\"image\"]],[26,\"action\",[[21,0,[]],[22,[\"uploadFinished\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"update\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.png' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(uploadFinished.calledOnce).to.be.true;
                done();
            });
        });

        (0, _mocha.it)('displays invalid file type error', function (done) {
            stubFailedUpload(server, 415, 'UnsupportedMediaTypeError');
            this.render(Ember.HTMLBars.template({
                "id": "XeIvxrz0",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"image\",\"update\"],[[22,[\"image\"]],[26,\"action\",[[21,0,[]],[22,[\"update\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.png' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(this.$('.failed').length, 'error message is displayed').to.equal(1);
                (0, _chai.expect)(this.$('.failed').text()).to.match(/The image type you uploaded is not supported/);
                (0, _chai.expect)(this.$('.gh-btn-green').length, 'reset button is displayed').to.equal(1);
                (0, _chai.expect)(this.$('.gh-btn-green').text()).to.equal('Try Again');
                done();
            });
        });

        (0, _mocha.it)('displays file too large for server error', function (done) {
            stubFailedUpload(server, 413, 'RequestEntityTooLargeError');
            this.render(Ember.HTMLBars.template({
                "id": "XeIvxrz0",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"image\",\"update\"],[[22,[\"image\"]],[26,\"action\",[[21,0,[]],[22,[\"update\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.png' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(this.$('.failed').length, 'error message is displayed').to.equal(1);
                (0, _chai.expect)(this.$('.failed').text()).to.match(/The image you uploaded was larger/);
                done();
            });
        });

        (0, _mocha.it)('handles file too large error directly from the web server', function (done) {
            server.post('/ghost/api/v0.1/uploads/', function () {
                return [413, {}, ''];
            });
            this.render(Ember.HTMLBars.template({
                "id": "XeIvxrz0",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"image\",\"update\"],[[22,[\"image\"]],[26,\"action\",[[21,0,[]],[22,[\"update\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.png' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(this.$('.failed').length, 'error message is displayed').to.equal(1);
                (0, _chai.expect)(this.$('.failed').text()).to.match(/The image you uploaded was larger/);
                done();
            });
        });

        (0, _mocha.it)('displays other server-side error with message', function (done) {
            stubFailedUpload(server, 400, 'UnknownError');
            this.render(Ember.HTMLBars.template({
                "id": "XeIvxrz0",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"image\",\"update\"],[[22,[\"image\"]],[26,\"action\",[[21,0,[]],[22,[\"update\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.png' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(this.$('.failed').length, 'error message is displayed').to.equal(1);
                (0, _chai.expect)(this.$('.failed').text()).to.match(/Error: UnknownError/);
                done();
            });
        });

        (0, _mocha.it)('handles unknown failure', function (done) {
            server.post('/ghost/api/v0.1/uploads/', function () {
                return [500, { 'Content-Type': 'application/json' }, ''];
            });
            this.render(Ember.HTMLBars.template({
                "id": "XeIvxrz0",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"image\",\"update\"],[[22,[\"image\"]],[26,\"action\",[[21,0,[]],[22,[\"update\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.png' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(this.$('.failed').length, 'error message is displayed').to.equal(1);
                (0, _chai.expect)(this.$('.failed').text()).to.match(/Something went wrong/);
                done();
            });
        });

        (0, _mocha.it)('triggers notifications.showAPIError for VersionMismatchError', function (done) {
            let showAPIError = _sinon.default.spy();
            this.set('notifications.showAPIError', showAPIError);

            stubFailedUpload(server, 400, 'VersionMismatchError');

            this.render(Ember.HTMLBars.template({
                "id": "XeIvxrz0",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"image\",\"update\"],[[22,[\"image\"]],[26,\"action\",[[21,0,[]],[22,[\"update\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.png' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(showAPIError.calledOnce).to.be.true;
                done();
            });
        });

        (0, _mocha.it)('doesn\'t trigger notifications.showAPIError for other errors', function (done) {
            let showAPIError = _sinon.default.spy();
            this.set('notifications.showAPIError', showAPIError);

            stubFailedUpload(server, 400, 'UnknownError');
            this.render(Ember.HTMLBars.template({
                "id": "XeIvxrz0",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"image\",\"update\"],[[22,[\"image\"]],[26,\"action\",[[21,0,[]],[22,[\"update\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.png' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(showAPIError.called).to.be.false;
                done();
            });
        });

        (0, _mocha.it)('can be reset after a failed upload', function (done) {
            stubFailedUpload(server, 400, 'UnknownError');
            this.render(Ember.HTMLBars.template({
                "id": "XeIvxrz0",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"image\",\"update\"],[[22,[\"image\"]],[26,\"action\",[[21,0,[]],[22,[\"update\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { type: 'test.png' });

            (0, _wait.default)().then(() => {
                Ember.run(() => {
                    this.$('.gh-btn-green').click();
                });
            });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(this.$('input[type="file"]').length).to.equal(1);
                done();
            });
        });

        (0, _mocha.it)('displays upload progress', function (done) {
            this.set('done', done);

            // pretender fires a progress event every 50ms
            stubSuccessfulUpload(server, 150);

            this.render(Ember.HTMLBars.template({
                "id": "D31Xd5p5",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"image\",\"uploadFinished\",\"update\"],[[22,[\"image\"]],[26,\"action\",[[21,0,[]],[22,[\"done\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"update\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.png' });

            // after 75ms we should have had one progress event
            Ember.run.later(this, function () {
                (0, _chai.expect)(this.$('.progress .bar').length).to.equal(1);

                var _$$attr$match = this.$('.progress .bar').attr('style').match(/width: (\d+)%?/),
                    _$$attr$match2 = _slicedToArray(_$$attr$match, 2);

                let percentageWidth = _$$attr$match2[1];

                percentageWidth = Number.parseInt(percentageWidth);
                (0, _chai.expect)(percentageWidth).to.be.above(0);
                (0, _chai.expect)(percentageWidth).to.be.below(100);
            }, 75);
        });

        (0, _mocha.it)('handles drag over/leave', function () {
            stubSuccessfulUpload(server);

            this.render(Ember.HTMLBars.template({
                "id": "XeIvxrz0",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"image\",\"update\"],[[22,[\"image\"]],[26,\"action\",[[21,0,[]],[22,[\"update\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            Ember.run(() => {
                // eslint-disable-next-line new-cap
                let dragover = Ember.$.Event('dragover', {
                    dataTransfer: {
                        files: []
                    }
                });
                this.$('.gh-image-uploader').trigger(dragover);
            });

            (0, _chai.expect)(this.$('.gh-image-uploader').hasClass('-drag-over'), 'has drag-over class').to.be.true;

            Ember.run(() => {
                this.$('.gh-image-uploader').trigger('dragleave');
            });

            (0, _chai.expect)(this.$('.gh-image-uploader').hasClass('-drag-over'), 'has drag-over class').to.be.false;
        });

        (0, _mocha.it)('triggers file upload on file drop', function (done) {
            let uploadSuccess = _sinon.default.spy();
            // eslint-disable-next-line new-cap
            let drop = Ember.$.Event('drop', {
                dataTransfer: {
                    files: [(0, _fileUpload.createFile)(['test'], { name: 'test.png' })]
                }
            });

            this.set('uploadSuccess', uploadSuccess);

            stubSuccessfulUpload(server);
            this.render(Ember.HTMLBars.template({
                "id": "szn4JkHp",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"uploadSuccess\"],[[26,\"action\",[[21,0,[]],[22,[\"uploadSuccess\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            Ember.run(() => {
                this.$('.gh-image-uploader').trigger(drop);
            });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(uploadSuccess.calledOnce).to.be.true;
                (0, _chai.expect)(uploadSuccess.firstCall.args[0]).to.equal('/content/images/test.png');
                done();
            });
        });

        (0, _mocha.it)('validates extension by default', function (done) {
            let uploadSuccess = _sinon.default.spy();
            let uploadFailed = _sinon.default.spy();

            this.set('uploadSuccess', uploadSuccess);
            this.set('uploadFailed', uploadFailed);

            stubSuccessfulUpload(server);

            this.render(Ember.HTMLBars.template({
                "id": "9PzAUzp1",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"uploadSuccess\",\"uploadFailed\"],[[26,\"action\",[[21,0,[]],[22,[\"uploadSuccess\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"uploadFailed\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.json' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(uploadSuccess.called).to.be.false;
                (0, _chai.expect)(uploadFailed.calledOnce).to.be.true;
                (0, _chai.expect)(this.$('.failed').length, 'error message is displayed').to.equal(1);
                (0, _chai.expect)(this.$('.failed').text()).to.match(/The image type you uploaded is not supported/);
                done();
            });
        });

        (0, _mocha.it)('uploads if validate action supplied and returns true', function (done) {
            let validate = _sinon.default.stub().returns(true);
            let uploadSuccess = _sinon.default.spy();

            this.set('validate', validate);
            this.set('uploadSuccess', uploadSuccess);

            stubSuccessfulUpload(server);

            this.render(Ember.HTMLBars.template({
                "id": "Gqx7bzT4",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"uploadSuccess\",\"validate\"],[[26,\"action\",[[21,0,[]],[22,[\"uploadSuccess\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"validate\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.txt' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(validate.calledOnce).to.be.true;
                (0, _chai.expect)(uploadSuccess.calledOnce).to.be.true;
                done();
            });
        });

        (0, _mocha.it)('skips upload and displays error if validate action supplied and doesn\'t return true', function (done) {
            let validate = _sinon.default.stub().returns(new _ajax.UnsupportedMediaTypeError());
            let uploadSuccess = _sinon.default.spy();
            let uploadFailed = _sinon.default.spy();

            this.set('validate', validate);
            this.set('uploadSuccess', uploadSuccess);
            this.set('uploadFailed', uploadFailed);

            stubSuccessfulUpload(server);

            this.render(Ember.HTMLBars.template({
                "id": "I1Rtv1QE",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader\",null,[[\"uploadSuccess\",\"uploadFailed\",\"validate\"],[[26,\"action\",[[21,0,[]],[22,[\"uploadSuccess\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"uploadFailed\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"validate\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _fileUpload.fileUpload)(this.$('input[type="file"]'), ['test'], { name: 'test.png' });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(validate.calledOnce).to.be.true;
                (0, _chai.expect)(uploadSuccess.called).to.be.false;
                (0, _chai.expect)(uploadFailed.calledOnce).to.be.true;
                (0, _chai.expect)(this.$('.failed').length, 'error message is displayed').to.equal(1);
                (0, _chai.expect)(this.$('.failed').text()).to.match(/The image type you uploaded is not supported/);
                done();
            });
        });

        (0, _mocha.describe)('unsplash', function () {
            (0, _mocha.it)('has unsplash icon only when unsplash is active & allowed');
            (0, _mocha.it)('opens unsplash modal when icon clicked');
            (0, _mocha.it)('inserts unsplash image when selected');
            (0, _mocha.it)('closes unsplash modal when close is triggered');
        });
    });
});
define('ghost-admin/tests/integration/components/gh-image-uploader-with-preview-test', ['sinon', 'mocha', 'chai', 'ember-mocha'], function (_sinon, _mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: gh-image-uploader-with-preview', function () {
        (0, _emberMocha.setupComponentTest)('gh-image-uploader-with-preview', {
            integration: true
        });

        (0, _mocha.it)('renders image if provided', function () {
            this.set('image', 'http://example.com/test.png');

            this.render(Ember.HTMLBars.template({
                "id": "MVkzQlBg",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader-with-preview\",null,[[\"image\"],[[22,[\"image\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _chai.expect)(this.$('.gh-image-uploader.-with-image').length).to.equal(1);
            (0, _chai.expect)(this.$('img').attr('src')).to.equal('http://example.com/test.png');
        });

        (0, _mocha.it)('renders upload form when no image provided', function () {
            this.render(Ember.HTMLBars.template({
                "id": "MVkzQlBg",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader-with-preview\",null,[[\"image\"],[[22,[\"image\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _chai.expect)(this.$('input[type="file"]').length).to.equal(1);
        });

        (0, _mocha.it)('triggers remove action when delete icon is clicked', function () {
            let remove = _sinon.default.spy();
            this.set('remove', remove);
            this.set('image', 'http://example.com/test.png');

            this.render(Ember.HTMLBars.template({
                "id": "x1mkm3bf",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-image-uploader-with-preview\",null,[[\"image\",\"remove\"],[[22,[\"image\"]],[26,\"action\",[[21,0,[]],[22,[\"remove\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            Ember.run(() => {
                this.$('.image-cancel').click();
            });

            (0, _chai.expect)(remove.calledOnce).to.be.true;
        });
    });
});
define('ghost-admin/tests/integration/components/gh-koenig-editor-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: gh-koenig-editor', function () {
        (0, _emberMocha.setupComponentTest)('gh-koenig-editor', {
            integration: true
        });

        (0, _mocha.it)('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#gh-koenig-editor}}
            //     template content
            //   {{/gh-koenig-editor}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "aN4fY/ey",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"gh-koenig-editor\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/gh-markdown-editor-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: gh-markdown-editor', function () {
        (0, _emberMocha.setupComponentTest)('gh-markdown-editor', {
            integration: true
        });

        (0, _mocha.it)('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#gh-markdown-editor}}
            //     template content
            //   {{/gh-markdown-editor}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "AdPR0L3w",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"gh-markdown-editor\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });

        (0, _mocha.describe)('unsplash', function () {
            (0, _mocha.it)('has unsplash icon in toolbar if unsplash is active');
            (0, _mocha.it)('opens unsplash modal when clicked');
            (0, _mocha.it)('closes unsplash modal when close triggered');
            (0, _mocha.it)('inserts unsplash image & credit when selected');
            (0, _mocha.it)('inserts at cursor when editor has focus');
            (0, _mocha.it)('inserts at end when editor is blurred');
        });
    });
});
define('ghost-admin/tests/integration/components/gh-navitem-test', ['ghost-admin/models/navigation-item', 'ember-test-helpers/wait', 'mocha', 'chai', 'ember-mocha'], function (_navigationItem, _wait, _mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: gh-navitem', function () {
        (0, _emberMocha.setupComponentTest)('gh-navitem', {
            integration: true
        });

        beforeEach(function () {
            this.set('baseUrl', 'http://localhost:2368');
        });

        (0, _mocha.it)('renders', function () {
            this.set('navItem', _navigationItem.default.create({ label: 'Test', url: '/url' }));

            this.render(Ember.HTMLBars.template({
                "id": "aT0Dmx0E",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-navitem\",null,[[\"navItem\",\"baseUrl\"],[[22,[\"navItem\"]],[22,[\"baseUrl\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            let $item = this.$('.gh-blognav-item');

            (0, _chai.expect)($item.find('.gh-blognav-grab').length).to.equal(1);
            (0, _chai.expect)($item.find('.gh-blognav-label').length).to.equal(1);
            (0, _chai.expect)($item.find('.gh-blognav-url').length).to.equal(1);
            (0, _chai.expect)($item.find('.gh-blognav-delete').length).to.equal(1);

            // doesn't show any errors
            (0, _chai.expect)($item.hasClass('gh-blognav-item--error')).to.be.false;
            (0, _chai.expect)($item.find('.error').length).to.equal(0);
            (0, _chai.expect)($item.find('.response:visible').length).to.equal(0);
        });

        (0, _mocha.it)('doesn\'t show drag handle for new items', function () {
            this.set('navItem', _navigationItem.default.create({ label: 'Test', url: '/url', isNew: true }));

            this.render(Ember.HTMLBars.template({
                "id": "aT0Dmx0E",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-navitem\",null,[[\"navItem\",\"baseUrl\"],[[22,[\"navItem\"]],[22,[\"baseUrl\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            let $item = this.$('.gh-blognav-item');

            (0, _chai.expect)($item.find('.gh-blognav-grab').length).to.equal(0);
        });

        (0, _mocha.it)('shows add button for new items', function () {
            this.set('navItem', _navigationItem.default.create({ label: 'Test', url: '/url', isNew: true }));

            this.render(Ember.HTMLBars.template({
                "id": "aT0Dmx0E",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-navitem\",null,[[\"navItem\",\"baseUrl\"],[[22,[\"navItem\"]],[22,[\"baseUrl\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            let $item = this.$('.gh-blognav-item');

            (0, _chai.expect)($item.find('.gh-blognav-add').length).to.equal(1);
            (0, _chai.expect)($item.find('.gh-blognav-delete').length).to.equal(0);
        });

        (0, _mocha.it)('triggers delete action', function () {
            this.set('navItem', _navigationItem.default.create({ label: 'Test', url: '/url' }));

            let deleteActionCallCount = 0;
            this.on('deleteItem', navItem => {
                (0, _chai.expect)(navItem).to.equal(this.get('navItem'));
                deleteActionCallCount += 1;
            });

            this.render(Ember.HTMLBars.template({
                "id": "WfjTboqI",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-navitem\",null,[[\"navItem\",\"baseUrl\",\"deleteItem\"],[[22,[\"navItem\"]],[22,[\"baseUrl\"]],[26,\"action\",[[21,0,[]],\"deleteItem\"],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            this.$('.gh-blognav-delete').trigger('click');

            (0, _chai.expect)(deleteActionCallCount).to.equal(1);
        });

        (0, _mocha.it)('triggers add action', function () {
            this.set('navItem', _navigationItem.default.create({ label: 'Test', url: '/url', isNew: true }));

            let addActionCallCount = 0;
            this.on('add', () => {
                addActionCallCount += 1;
            });

            this.render(Ember.HTMLBars.template({
                "id": "JesGMLv+",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-navitem\",null,[[\"navItem\",\"baseUrl\",\"addItem\"],[[22,[\"navItem\"]],[22,[\"baseUrl\"]],[26,\"action\",[[21,0,[]],\"add\"],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            this.$('.gh-blognav-add').trigger('click');

            (0, _chai.expect)(addActionCallCount).to.equal(1);
        });

        (0, _mocha.it)('triggers update url action', function () {
            this.set('navItem', _navigationItem.default.create({ label: 'Test', url: '/url' }));

            let updateActionCallCount = 0;
            this.on('update', () => {
                updateActionCallCount += 1;
            });

            this.render(Ember.HTMLBars.template({
                "id": "9bu0VTqR",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-navitem\",null,[[\"navItem\",\"baseUrl\",\"updateUrl\"],[[22,[\"navItem\"]],[22,[\"baseUrl\"]],[26,\"action\",[[21,0,[]],\"update\"],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            this.$('.gh-blognav-url input').trigger('blur');

            (0, _chai.expect)(updateActionCallCount).to.equal(1);
        });

        (0, _mocha.it)('triggers update label action', function () {
            this.set('navItem', _navigationItem.default.create({ label: 'Test', url: '/url' }));

            let updateActionCallCount = 0;
            this.on('update', () => {
                updateActionCallCount += 1;
            });

            this.render(Ember.HTMLBars.template({
                "id": "kFNdgBGF",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-navitem\",null,[[\"navItem\",\"baseUrl\",\"updateLabel\"],[[22,[\"navItem\"]],[22,[\"baseUrl\"]],[26,\"action\",[[21,0,[]],\"update\"],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            this.$('.gh-blognav-label input').trigger('blur');

            (0, _chai.expect)(updateActionCallCount).to.equal(1);
        });

        (0, _mocha.it)('displays inline errors', function () {
            this.set('navItem', _navigationItem.default.create({ label: '', url: '' }));
            this.get('navItem').validate();

            this.render(Ember.HTMLBars.template({
                "id": "aT0Dmx0E",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-navitem\",null,[[\"navItem\",\"baseUrl\"],[[22,[\"navItem\"]],[22,[\"baseUrl\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            let $item = this.$('.gh-blognav-item');

            return (0, _wait.default)().then(() => {
                (0, _chai.expect)($item.hasClass('gh-blognav-item--error')).to.be.true;
                (0, _chai.expect)($item.find('.gh-blognav-label').hasClass('error')).to.be.true;
                (0, _chai.expect)($item.find('.gh-blognav-label .response').text().trim()).to.equal('You must specify a label');
                (0, _chai.expect)($item.find('.gh-blognav-url').hasClass('error')).to.be.true;
                (0, _chai.expect)($item.find('.gh-blognav-url .response').text().trim()).to.equal('You must specify a URL or relative path');
            });
        });
    });
});
define('ghost-admin/tests/integration/components/gh-navitem-url-input-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    // we want baseUrl to match the running domain so relative URLs are
    // handled as expected (browser auto-sets the domain when using a.href)
    let currentUrl = `${window.location.protocol}//${window.location.host}/`;

    (0, _mocha.describe)('Integration: Component: gh-navitem-url-input', function () {
        (0, _emberMocha.setupComponentTest)('gh-navitem-url-input', {
            integration: true
        });

        beforeEach(function () {
            // set defaults
            this.set('baseUrl', currentUrl);
            this.set('url', '');
            this.set('isNew', false);
            this.on('clearErrors', function () {
                return null;
            });
        });

        (0, _mocha.it)('renders correctly with blank url', function () {
            this.render(Ember.HTMLBars.template({
                "id": "DEau3mR6",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-navitem-url-input\",null,[[\"baseUrl\",\"url\",\"isNew\",\"clearErrors\"],[[22,[\"baseUrl\"]],[22,[\"url\"]],[22,[\"isNew\"]],[26,\"action\",[[21,0,[]],\"clearErrors\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            let $input = this.$('input');

            (0, _chai.expect)($input).to.have.length(1);
            (0, _chai.expect)($input.hasClass('gh-input')).to.be.true;
            (0, _chai.expect)($input.val()).to.equal(currentUrl);
        });

        (0, _mocha.it)('renders correctly with relative urls', function () {
            this.set('url', '/about');
            this.render(Ember.HTMLBars.template({
                "id": "DEau3mR6",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-navitem-url-input\",null,[[\"baseUrl\",\"url\",\"isNew\",\"clearErrors\"],[[22,[\"baseUrl\"]],[22,[\"url\"]],[22,[\"isNew\"]],[26,\"action\",[[21,0,[]],\"clearErrors\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            let $input = this.$('input');

            (0, _chai.expect)($input.val()).to.equal(`${currentUrl}about`);

            this.set('url', '/about#contact');
            (0, _chai.expect)($input.val()).to.equal(`${currentUrl}about#contact`);
        });

        (0, _mocha.it)('renders correctly with absolute urls', function () {
            this.set('url', 'https://example.com:2368/#test');
            this.render(Ember.HTMLBars.template({
                "id": "DEau3mR6",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-navitem-url-input\",null,[[\"baseUrl\",\"url\",\"isNew\",\"clearErrors\"],[[22,[\"baseUrl\"]],[22,[\"url\"]],[22,[\"isNew\"]],[26,\"action\",[[21,0,[]],\"clearErrors\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            let $input = this.$('input');

            (0, _chai.expect)($input.val()).to.equal('https://example.com:2368/#test');

            this.set('url', 'mailto:test@example.com');
            (0, _chai.expect)($input.val()).to.equal('mailto:test@example.com');

            this.set('url', 'tel:01234-5678-90');
            (0, _chai.expect)($input.val()).to.equal('tel:01234-5678-90');

            this.set('url', '//protocol-less-url.com');
            (0, _chai.expect)($input.val()).to.equal('//protocol-less-url.com');

            this.set('url', '#anchor');
            (0, _chai.expect)($input.val()).to.equal('#anchor');
        });

        (0, _mocha.it)('deletes base URL on backspace', function () {
            this.render(Ember.HTMLBars.template({
                "id": "DEau3mR6",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-navitem-url-input\",null,[[\"baseUrl\",\"url\",\"isNew\",\"clearErrors\"],[[22,[\"baseUrl\"]],[22,[\"url\"]],[22,[\"isNew\"]],[26,\"action\",[[21,0,[]],\"clearErrors\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            let $input = this.$('input');

            (0, _chai.expect)($input.val()).to.equal(currentUrl);
            Ember.run(() => {
                // TODO: why is ember's keyEvent helper not available here?
                // eslint-disable-next-line new-cap
                let e = Ember.$.Event('keydown');
                e.keyCode = 8;
                $input.trigger(e);
            });
            (0, _chai.expect)($input.val()).to.equal('');
        });

        (0, _mocha.it)('deletes base URL on delete', function () {
            this.render(Ember.HTMLBars.template({
                "id": "DEau3mR6",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-navitem-url-input\",null,[[\"baseUrl\",\"url\",\"isNew\",\"clearErrors\"],[[22,[\"baseUrl\"]],[22,[\"url\"]],[22,[\"isNew\"]],[26,\"action\",[[21,0,[]],\"clearErrors\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            let $input = this.$('input');

            (0, _chai.expect)($input.val()).to.equal(currentUrl);
            Ember.run(() => {
                // TODO: why is ember's keyEvent helper not available here?
                // eslint-disable-next-line new-cap
                let e = Ember.$.Event('keydown');
                e.keyCode = 46;
                $input.trigger(e);
            });
            (0, _chai.expect)($input.val()).to.equal('');
        });

        (0, _mocha.it)('adds base url to relative urls on blur', function () {
            this.on('updateUrl', () => null);
            this.render(Ember.HTMLBars.template({
                "id": "Vx+XWLqp",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-navitem-url-input\",null,[[\"baseUrl\",\"url\",\"isNew\",\"update\",\"clearErrors\"],[[22,[\"baseUrl\"]],[22,[\"url\"]],[22,[\"isNew\"]],[26,\"action\",[[21,0,[]],\"updateUrl\"],null],[26,\"action\",[[21,0,[]],\"clearErrors\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            let $input = this.$('input');

            Ember.run(() => {
                $input.val('/about').trigger('input');
            });
            Ember.run(() => {
                $input.trigger('blur');
            });

            (0, _chai.expect)($input.val()).to.equal(`${currentUrl}about`);
        });

        (0, _mocha.it)('adds "mailto:" to email addresses on blur', function () {
            this.on('updateUrl', () => null);
            this.render(Ember.HTMLBars.template({
                "id": "Vx+XWLqp",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-navitem-url-input\",null,[[\"baseUrl\",\"url\",\"isNew\",\"update\",\"clearErrors\"],[[22,[\"baseUrl\"]],[22,[\"url\"]],[22,[\"isNew\"]],[26,\"action\",[[21,0,[]],\"updateUrl\"],null],[26,\"action\",[[21,0,[]],\"clearErrors\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            let $input = this.$('input');

            Ember.run(() => {
                $input.val('test@example.com').trigger('input');
            });
            Ember.run(() => {
                $input.trigger('blur');
            });

            (0, _chai.expect)($input.val()).to.equal('mailto:test@example.com');

            // ensure we don't double-up on the mailto:
            Ember.run(() => {
                $input.trigger('blur');
            });
            (0, _chai.expect)($input.val()).to.equal('mailto:test@example.com');
        });

        (0, _mocha.it)('doesn\'t add base url to invalid urls on blur', function () {
            this.on('updateUrl', () => null);
            this.render(Ember.HTMLBars.template({
                "id": "Vx+XWLqp",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-navitem-url-input\",null,[[\"baseUrl\",\"url\",\"isNew\",\"update\",\"clearErrors\"],[[22,[\"baseUrl\"]],[22,[\"url\"]],[22,[\"isNew\"]],[26,\"action\",[[21,0,[]],\"updateUrl\"],null],[26,\"action\",[[21,0,[]],\"clearErrors\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            let $input = this.$('input');

            let changeValue = function changeValue(value) {
                Ember.run(() => {
                    $input.val(value).trigger('input').trigger('blur');
                });
            };

            changeValue('with spaces');
            (0, _chai.expect)($input.val()).to.equal('with spaces');

            changeValue('/with spaces');
            (0, _chai.expect)($input.val()).to.equal('/with spaces');
        });

        (0, _mocha.it)('doesn\'t mangle invalid urls on blur', function () {
            this.on('updateUrl', () => null);
            this.render(Ember.HTMLBars.template({
                "id": "Vx+XWLqp",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-navitem-url-input\",null,[[\"baseUrl\",\"url\",\"isNew\",\"update\",\"clearErrors\"],[[22,[\"baseUrl\"]],[22,[\"url\"]],[22,[\"isNew\"]],[26,\"action\",[[21,0,[]],\"updateUrl\"],null],[26,\"action\",[[21,0,[]],\"clearErrors\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            let $input = this.$('input');

            Ember.run(() => {
                $input.val(`${currentUrl} /test`).trigger('input').trigger('blur');
            });

            (0, _chai.expect)($input.val()).to.equal(`${currentUrl} /test`);
        });

        // https://github.com/TryGhost/Ghost/issues/9373
        (0, _mocha.it)('doesn\'t mangle urls when baseUrl has unicode characters', function () {
            this.on('updateUrl', () => null);

            this.set('baseUrl', 'http://exämple.com');

            this.render(Ember.HTMLBars.template({
                "id": "Vx+XWLqp",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-navitem-url-input\",null,[[\"baseUrl\",\"url\",\"isNew\",\"update\",\"clearErrors\"],[[22,[\"baseUrl\"]],[22,[\"url\"]],[22,[\"isNew\"]],[26,\"action\",[[21,0,[]],\"updateUrl\"],null],[26,\"action\",[[21,0,[]],\"clearErrors\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            let $input = this.$('input');

            Ember.run(() => {
                $input.val(`${currentUrl}/test`).trigger('input').trigger('blur');
            });

            (0, _chai.expect)($input.val()).to.equal(`${currentUrl}/test`);
        });

        (0, _mocha.it)('triggers "update" action on blur', function () {
            let changeActionCallCount = 0;
            this.on('updateUrl', () => {
                changeActionCallCount += 1;
            });

            this.render(Ember.HTMLBars.template({
                "id": "Vx+XWLqp",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-navitem-url-input\",null,[[\"baseUrl\",\"url\",\"isNew\",\"update\",\"clearErrors\"],[[22,[\"baseUrl\"]],[22,[\"url\"]],[22,[\"isNew\"]],[26,\"action\",[[21,0,[]],\"updateUrl\"],null],[26,\"action\",[[21,0,[]],\"clearErrors\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            let $input = this.$('input');

            $input.trigger('blur');

            (0, _chai.expect)(changeActionCallCount).to.equal(1);
        });

        (0, _mocha.it)('triggers "update" action on enter', function () {
            let changeActionCallCount = 0;
            this.on('updateUrl', () => {
                changeActionCallCount += 1;
            });

            this.render(Ember.HTMLBars.template({
                "id": "Vx+XWLqp",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-navitem-url-input\",null,[[\"baseUrl\",\"url\",\"isNew\",\"update\",\"clearErrors\"],[[22,[\"baseUrl\"]],[22,[\"url\"]],[22,[\"isNew\"]],[26,\"action\",[[21,0,[]],\"updateUrl\"],null],[26,\"action\",[[21,0,[]],\"clearErrors\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            let $input = this.$('input');

            Ember.run(() => {
                // TODO: why is ember's keyEvent helper not available here?
                // eslint-disable-next-line new-cap
                let e = Ember.$.Event('keypress');
                e.keyCode = 13;
                $input.trigger(e);
            });

            (0, _chai.expect)(changeActionCallCount).to.equal(1);
        });

        (0, _mocha.it)('triggers "update" action on CMD-S', function () {
            let changeActionCallCount = 0;
            this.on('updateUrl', () => {
                changeActionCallCount += 1;
            });

            this.render(Ember.HTMLBars.template({
                "id": "Vx+XWLqp",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-navitem-url-input\",null,[[\"baseUrl\",\"url\",\"isNew\",\"update\",\"clearErrors\"],[[22,[\"baseUrl\"]],[22,[\"url\"]],[22,[\"isNew\"]],[26,\"action\",[[21,0,[]],\"updateUrl\"],null],[26,\"action\",[[21,0,[]],\"clearErrors\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            let $input = this.$('input');

            Ember.run(() => {
                // TODO: why is ember's keyEvent helper not available here?
                // eslint-disable-next-line new-cap
                let e = Ember.$.Event('keydown');
                e.keyCode = 83;
                e.metaKey = true;
                $input.trigger(e);
            });

            (0, _chai.expect)(changeActionCallCount).to.equal(1);
        });

        (0, _mocha.it)('sends absolute urls straight through to change action', function () {
            let expectedUrl = '';

            this.on('updateUrl', url => {
                (0, _chai.expect)(url).to.equal(expectedUrl);
            });

            this.render(Ember.HTMLBars.template({
                "id": "Vx+XWLqp",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-navitem-url-input\",null,[[\"baseUrl\",\"url\",\"isNew\",\"update\",\"clearErrors\"],[[22,[\"baseUrl\"]],[22,[\"url\"]],[22,[\"isNew\"]],[26,\"action\",[[21,0,[]],\"updateUrl\"],null],[26,\"action\",[[21,0,[]],\"clearErrors\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            let $input = this.$('input');

            let testUrl = url => {
                expectedUrl = url;
                Ember.run(() => {
                    $input.val(url).trigger('input');
                });
                Ember.run(() => {
                    $input.trigger('blur');
                });
            };

            testUrl('http://example.com');
            testUrl('http://example.com/');
            testUrl('https://example.com');
            testUrl('//example.com');
            testUrl('//localhost:1234');
            testUrl('#anchor');
            testUrl('mailto:test@example.com');
            testUrl('tel:12345-567890');
            testUrl('javascript:alert("testing");');
        });

        (0, _mocha.it)('strips base url from relative urls before sending to change action', function () {
            let expectedUrl = '';

            this.on('updateUrl', url => {
                (0, _chai.expect)(url).to.equal(expectedUrl);
            });

            this.render(Ember.HTMLBars.template({
                "id": "Vx+XWLqp",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-navitem-url-input\",null,[[\"baseUrl\",\"url\",\"isNew\",\"update\",\"clearErrors\"],[[22,[\"baseUrl\"]],[22,[\"url\"]],[22,[\"isNew\"]],[26,\"action\",[[21,0,[]],\"updateUrl\"],null],[26,\"action\",[[21,0,[]],\"clearErrors\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            let $input = this.$('input');

            let testUrl = url => {
                expectedUrl = `/${url}`;
                Ember.run(() => {
                    $input.val(`${currentUrl}${url}`).trigger('input');
                });
                Ember.run(() => {
                    $input.trigger('blur');
                });
            };

            testUrl('about/');
            testUrl('about#contact');
            testUrl('test/nested/');
        });

        (0, _mocha.it)('handles links to subdomains of blog domain', function () {
            let expectedUrl = '';

            this.set('baseUrl', 'http://example.com/');

            this.on('updateUrl', url => {
                (0, _chai.expect)(url).to.equal(expectedUrl);
            });

            this.render(Ember.HTMLBars.template({
                "id": "Vx+XWLqp",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-navitem-url-input\",null,[[\"baseUrl\",\"url\",\"isNew\",\"update\",\"clearErrors\"],[[22,[\"baseUrl\"]],[22,[\"url\"]],[22,[\"isNew\"]],[26,\"action\",[[21,0,[]],\"updateUrl\"],null],[26,\"action\",[[21,0,[]],\"clearErrors\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            let $input = this.$('input');

            expectedUrl = 'http://test.example.com/';
            Ember.run(() => {
                $input.val(expectedUrl).trigger('input').trigger('blur');
            });
            (0, _chai.expect)($input.val()).to.equal(expectedUrl);
        });

        (0, _mocha.it)('adds trailing slash to relative URL', function () {
            let expectedUrl = '';

            this.on('updateUrl', url => {
                (0, _chai.expect)(url).to.equal(expectedUrl);
            });

            this.render(Ember.HTMLBars.template({
                "id": "Vx+XWLqp",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-navitem-url-input\",null,[[\"baseUrl\",\"url\",\"isNew\",\"update\",\"clearErrors\"],[[22,[\"baseUrl\"]],[22,[\"url\"]],[22,[\"isNew\"]],[26,\"action\",[[21,0,[]],\"updateUrl\"],null],[26,\"action\",[[21,0,[]],\"clearErrors\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            let $input = this.$('input');

            let testUrl = url => {
                expectedUrl = `/${url}/`;
                Ember.run(() => {
                    $input.val(`${currentUrl}${url}`).trigger('input');
                });
                Ember.run(() => {
                    $input.trigger('blur');
                });
            };

            testUrl('about');
            testUrl('test/nested');
        });

        (0, _mocha.it)('does not add trailing slash on relative URL with [.?#]', function () {
            let expectedUrl = '';

            this.on('updateUrl', url => {
                (0, _chai.expect)(url).to.equal(expectedUrl);
            });

            this.render(Ember.HTMLBars.template({
                "id": "Vx+XWLqp",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-navitem-url-input\",null,[[\"baseUrl\",\"url\",\"isNew\",\"update\",\"clearErrors\"],[[22,[\"baseUrl\"]],[22,[\"url\"]],[22,[\"isNew\"]],[26,\"action\",[[21,0,[]],\"updateUrl\"],null],[26,\"action\",[[21,0,[]],\"clearErrors\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            let $input = this.$('input');

            let testUrl = url => {
                expectedUrl = `/${url}`;
                Ember.run(() => {
                    $input.val(`${currentUrl}${url}`).trigger('input');
                });
                Ember.run(() => {
                    $input.trigger('blur');
                });
            };

            testUrl('about#contact');
            testUrl('test/nested.svg');
            testUrl('test?gho=sties');
            testUrl('test/nested?sli=mer');
        });

        (0, _mocha.it)('does not add trailing slash on non-relative URLs', function () {
            let expectedUrl = '';

            this.on('updateUrl', url => {
                (0, _chai.expect)(url).to.equal(expectedUrl);
            });

            this.render(Ember.HTMLBars.template({
                "id": "Vx+XWLqp",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-navitem-url-input\",null,[[\"baseUrl\",\"url\",\"isNew\",\"update\",\"clearErrors\"],[[22,[\"baseUrl\"]],[22,[\"url\"]],[22,[\"isNew\"]],[26,\"action\",[[21,0,[]],\"updateUrl\"],null],[26,\"action\",[[21,0,[]],\"clearErrors\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            let $input = this.$('input');

            let testUrl = url => {
                expectedUrl = `/${url}`;
                Ember.run(() => {
                    $input.val(`${currentUrl}${url}`).trigger('input');
                });
                Ember.run(() => {
                    $input.trigger('blur');
                });
            };

            testUrl('http://woo.ff/test');
            testUrl('http://me.ow:2342/nested/test');
            testUrl('https://wro.om/car#race');
            testUrl('https://kabo.om/explosion?really=now');
        });

        (0, _mocha.describe)('with sub-folder baseUrl', function () {
            beforeEach(function () {
                this.set('baseUrl', `${currentUrl}blog/`);
            });

            (0, _mocha.it)('handles URLs relative to base url', function () {
                let expectedUrl = '';

                this.on('updateUrl', url => {
                    (0, _chai.expect)(url).to.equal(expectedUrl);
                });

                this.render(Ember.HTMLBars.template({
                    "id": "lWDB9sBN",
                    "block": "{\"symbols\":[],\"statements\":[[0,\"\\n                \"],[1,[26,\"gh-navitem-url-input\",null,[[\"baseUrl\",\"url\",\"isNew\",\"update\",\"clearErrors\"],[[22,[\"baseUrl\"]],[22,[\"url\"]],[22,[\"isNew\"]],[26,\"action\",[[21,0,[]],\"updateUrl\"],null],[26,\"action\",[[21,0,[]],\"clearErrors\"],null]]]],false],[0,\"\\n            \"]],\"hasEval\":false}",
                    "meta": {}
                }));
                let $input = this.$('input');

                let testUrl = url => {
                    expectedUrl = url;
                    Ember.run(() => {
                        $input.val(`${currentUrl}blog${url}`).trigger('input');
                    });
                    Ember.run(() => {
                        $input.trigger('blur');
                    });
                };

                testUrl('/about/');
                testUrl('/about#contact');
                testUrl('/test/nested/');
            });

            (0, _mocha.it)('handles URLs relative to base host', function () {
                let expectedUrl = '';

                this.on('updateUrl', url => {
                    (0, _chai.expect)(url).to.equal(expectedUrl);
                });

                this.render(Ember.HTMLBars.template({
                    "id": "lWDB9sBN",
                    "block": "{\"symbols\":[],\"statements\":[[0,\"\\n                \"],[1,[26,\"gh-navitem-url-input\",null,[[\"baseUrl\",\"url\",\"isNew\",\"update\",\"clearErrors\"],[[22,[\"baseUrl\"]],[22,[\"url\"]],[22,[\"isNew\"]],[26,\"action\",[[21,0,[]],\"updateUrl\"],null],[26,\"action\",[[21,0,[]],\"clearErrors\"],null]]]],false],[0,\"\\n            \"]],\"hasEval\":false}",
                    "meta": {}
                }));
                let $input = this.$('input');

                let testUrl = url => {
                    expectedUrl = url;
                    Ember.run(() => {
                        $input.val(url).trigger('input');
                    });
                    Ember.run(() => {
                        $input.trigger('blur');
                    });
                };

                testUrl(`http://${window.location.host}`);
                testUrl(`https://${window.location.host}`);
                testUrl(`http://${window.location.host}/`);
                testUrl(`https://${window.location.host}/`);
                testUrl(`http://${window.location.host}/test`);
                testUrl(`https://${window.location.host}/test`);
                testUrl(`http://${window.location.host}/#test`);
                testUrl(`https://${window.location.host}/#test`);
                testUrl(`http://${window.location.host}/another/folder`);
                testUrl(`https://${window.location.host}/another/folder`);
            });
        });
    });
});
define('ghost-admin/tests/integration/components/gh-notification-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
        'use strict';

        (0, _mocha.describe)('Integration: Component: gh-notification', function () {
                (0, _emberMocha.setupComponentTest)('gh-notification', {
                        integration: true
                });

                (0, _mocha.it)('renders', function () {
                        this.set('message', { message: 'Test message', type: 'success' });

                        this.render(Ember.HTMLBars.template({
                                "id": "9nbtTcYF",
                                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-notification\",null,[[\"message\"],[[22,[\"message\"]]]]],false]],\"hasEval\":false}",
                                "meta": {}
                        }));

                        (0, _chai.expect)(this.$('article.gh-notification')).to.have.length(1);
                        let $notification = this.$('.gh-notification');

                        (0, _chai.expect)($notification.hasClass('gh-notification-passive')).to.be.true;
                        (0, _chai.expect)($notification.text()).to.match(/Test message/);
                });

                (0, _mocha.it)('maps message types to CSS classes', function () {
                        this.set('message', { message: 'Test message', type: 'success' });

                        this.render(Ember.HTMLBars.template({
                                "id": "9nbtTcYF",
                                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-notification\",null,[[\"message\"],[[22,[\"message\"]]]]],false]],\"hasEval\":false}",
                                "meta": {}
                        }));
                        let $notification = this.$('.gh-notification');

                        this.set('message.type', 'success');
                        (0, _chai.expect)($notification.hasClass('gh-notification-green'), 'success class isn\'t green').to.be.true;

                        this.set('message.type', 'error');
                        (0, _chai.expect)($notification.hasClass('gh-notification-red'), 'success class isn\'t red').to.be.true;

                        this.set('message.type', 'warn');
                        (0, _chai.expect)($notification.hasClass('gh-notification-yellow'), 'success class isn\'t yellow').to.be.true;
                });
        });
});
define('ghost-admin/tests/integration/components/gh-notifications-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    let notificationsStub = Ember.Service.extend({
        notifications: Ember.A()
    });

    (0, _mocha.describe)('Integration: Component: gh-notifications', function () {
        (0, _emberMocha.setupComponentTest)('gh-notifications', {
            integration: true
        });

        beforeEach(function () {
            this.register('service:notifications', notificationsStub);
            this.inject.service('notifications', { as: 'notifications' });

            this.set('notifications.notifications', [{ message: 'First', type: 'error' }, { message: 'Second', type: 'warn' }]);
        });

        (0, _mocha.it)('renders', function () {
            this.render(Ember.HTMLBars.template({
                "id": "HxzLzO+J",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"gh-notifications\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$('.gh-notifications').length).to.equal(1);

            (0, _chai.expect)(this.$('.gh-notifications').children().length).to.equal(2);

            this.set('notifications.notifications', Ember.A());
            (0, _chai.expect)(this.$('.gh-notifications').children().length).to.equal(0);
        });
    });
});
define('ghost-admin/tests/integration/components/gh-profile-image-test', ['pretender', 'npm:blueimp-md5', 'ember-test-helpers/wait', 'mocha', 'chai', 'ember-mocha', 'ember-concurrency'], function (_pretender, _npmBlueimpMd, _wait, _mocha, _chai, _emberMocha, _emberConcurrency) {
    'use strict';

    let pathsStub = Ember.Service.extend({
        assetRoot: '/ghost/assets/',

        init() {
            this._super(...arguments);

            this.url = {
                api() {
                    return '';
                },
                asset(src) {
                    return src;
                }
            };
        }
    });

    const stubKnownGravatar = function stubKnownGravatar(server) {
        server.get('http://www.gravatar.com/avatar/:md5', function () {
            return [200, { 'Content-Type': 'image/png' }, ''];
        });

        server.head('http://www.gravatar.com/avatar/:md5', function () {
            return [200, { 'Content-Type': 'image/png' }, ''];
        });
    };

    const stubUnknownGravatar = function stubUnknownGravatar(server) {
        server.get('http://www.gravatar.com/avatar/:md5', function () {
            return [404, {}, ''];
        });

        server.head('http://www.gravatar.com/avatar/:md5', function () {
            return [404, {}, ''];
        });
    };

    let configStubuseGravatar = Ember.Service.extend({
        useGravatar: true
    });

    (0, _mocha.describe)('Integration: Component: gh-profile-image', function () {
        (0, _emberMocha.setupComponentTest)('gh-profile-image', {
            integration: true
        });

        let server;

        beforeEach(function () {
            this.register('service:ghost-paths', pathsStub);
            this.inject.service('ghost-paths', { as: 'ghost-paths' });
            this.register('service:config', configStubuseGravatar);
            this.inject.service('config', { as: 'config' });

            server = new _pretender.default();
            stubKnownGravatar(server);
        });

        afterEach(function () {
            server.shutdown();
        });

        (0, _mocha.it)('renders', function () {
            this.set('email', '');

            this.render(Ember.HTMLBars.template({
                "id": "zZboyCyD",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-profile-image\",null,[[\"email\"],[[22,[\"email\"]]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _chai.expect)(this.$()).to.have.length(1);
        });

        (0, _mocha.it)('renders default image if no email supplied', function () {
            this.set('email', null);

            this.render(Ember.HTMLBars.template({
                "id": "464I/WA9",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-profile-image\",null,[[\"email\",\"size\",\"debounce\"],[[22,[\"email\"]],100,50]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _chai.expect)(this.$('.gravatar-img').attr('style'), 'gravatar image style').to.equal('display: none');
        });

        (0, _mocha.it)('renders the gravatar if valid email supplied and privacy.useGravatar allows it', async function () {
            let email = 'test@example.com';
            let expectedUrl = `//www.gravatar.com/avatar/${(0, _npmBlueimpMd.default)(email)}?s=100&d=404`;

            this.set('email', email);

            this.render(Ember.HTMLBars.template({
                "id": "464I/WA9",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-profile-image\",null,[[\"email\",\"size\",\"debounce\"],[[22,[\"email\"]],100,50]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));

            // wait for the ajax request to complete
            await (0, _wait.default)();

            (0, _chai.expect)(this.$('.gravatar-img').attr('style'), 'gravatar image style').to.equal(`background-image: url(${expectedUrl}); display: block`);
        });

        (0, _mocha.it)('doesn\'t render the gravatar if valid email supplied but privacy.useGravatar forbids it', async function () {
            let email = 'test@example.com';

            this.set('email', email);
            this.set('config.useGravatar', false);

            this.render(Ember.HTMLBars.template({
                "id": "464I/WA9",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-profile-image\",null,[[\"email\",\"size\",\"debounce\"],[[22,[\"email\"]],100,50]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));

            await (0, _wait.default)();

            (0, _chai.expect)(this.$('.gravatar-img').attr('style'), 'gravatar image style').to.equal('display: none');
        });

        (0, _mocha.it)('doesn\'t add background url if gravatar image doesn\'t exist', async function () {
            stubUnknownGravatar(server);

            this.render(Ember.HTMLBars.template({
                "id": "fey5S+Tc",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-profile-image\",null,[[\"email\",\"size\",\"debounce\"],[\"test@example.com\",100,50]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));

            await (0, _wait.default)();

            (0, _chai.expect)(this.$('.gravatar-img').attr('style'), 'gravatar image style').to.equal('background-image: url(); display: none');
        });

        (0, _mocha.it)('throttles gravatar loading as email is changed', async function () {
            let email = 'test@example.com';
            let expectedUrl = `//www.gravatar.com/avatar/${(0, _npmBlueimpMd.default)(email)}?s=100&d=404`;

            this.set('email', 'test');

            this.render(Ember.HTMLBars.template({
                "id": "Ah3tS10Y",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-profile-image\",null,[[\"email\",\"size\",\"debounce\"],[[22,[\"email\"]],100,300]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));

            Ember.run(() => {
                this.set('email', email);
            });

            (0, _chai.expect)(this.$('.gravatar-img').attr('style'), '.gravatar-img background not immediately changed on email change').to.equal('display: none');

            await (0, _emberConcurrency.timeout)(250);

            (0, _chai.expect)(this.$('.gravatar-img').attr('style'), '.gravatar-img background still not changed before debounce timeout').to.equal('display: none');

            await (0, _emberConcurrency.timeout)(100);

            (0, _chai.expect)(this.$('.gravatar-img').attr('style'), '.gravatar-img background changed after debounce timeout').to.equal(`background-image: url(${expectedUrl}); display: block`);
        });
    });
});
define('ghost-admin/tests/integration/components/gh-progress-bar-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: gh-progress-bar', function () {
        (0, _emberMocha.setupComponentTest)('gh-progress-bar', {
            integration: true
        });

        (0, _mocha.it)('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#gh-progress-bar}}
            //     template content
            //   {{/gh-progress-bar}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "0fz+GHji",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"gh-progress-bar\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/gh-psm-tags-input-test', ['ghost-admin/mirage/config/posts', 'ghost-admin/mirage/config/themes', 'ember-test-helpers/wait', 'ember-native-dom-helpers', 'ember-power-select/test-support/helpers', 'mocha', 'chai', 'ember-mocha', 'ghost-admin/initializers/ember-cli-mirage'], function (_posts, _themes, _wait, _emberNativeDomHelpers, _helpers, _mocha, _chai, _emberMocha, _emberCliMirage) {
    'use strict';

    // NOTE: although Mirage has posts<->tags relationship and can respond
    // to :post-id/?include=tags all ordering information is lost so we
    // need to build the tags array manually
    const assignPostWithTags = function postWithTags(context, ...slugs) {
        context.get('store').findRecord('post', 1).then(post => {
            context.get('store').findAll('tag').then(tags => {
                slugs.forEach(slug => {
                    post.get('tags').pushObject(tags.findBy('slug', slug));
                });

                context.set('post', post);
            });
        });
    };

    // TODO: Unskip and fix
    // skipped because it was failing most of the time on Travis
    // see https://github.com/TryGhost/Ghost/issues/8805
    _mocha.describe.skip('Integration: Component: gh-psm-tags-input', function () {
        (0, _emberMocha.setupComponentTest)('gh-psm-tags-input', {
            integration: true
        });

        let server;

        beforeEach(function () {
            server = (0, _emberCliMirage.startMirage)();
            let author = server.create('user');

            (0, _posts.default)(server);
            (0, _themes.default)(server);

            server.create('post', { author });
            server.create('tag', { name: 'Tag One', slug: 'one' });
            server.create('tag', { name: 'Tag Two', slug: 'two' });
            server.create('tag', { name: 'Tag Three', slug: 'three' });
            server.create('tag', { name: '#Internal Tag', visibility: 'internal', slug: 'internal' });

            this.inject.service('store');
        });

        afterEach(function () {
            server.shutdown();
        });

        (0, _mocha.it)('shows selected tags on render', async function () {
            Ember.run(() => {
                assignPostWithTags(this, 'one', 'three');
            });
            await (0, _wait.default)();

            await this.render(Ember.HTMLBars.template({
                "id": "Rk4Zappf",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-psm-tags-input\",null,[[\"post\"],[[22,[\"post\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            let selected = (0, _emberNativeDomHelpers.findAll)('.tag-token');
            (0, _chai.expect)(selected.length).to.equal(2);
            (0, _chai.expect)(selected[0].textContent).to.have.string('Tag One');
            (0, _chai.expect)(selected[1].textContent).to.have.string('Tag Three');
        });

        (0, _mocha.it)('exposes all tags as options', async function () {
            Ember.run(() => {
                this.set('post', this.get('store').findRecord('post', 1));
            });
            await (0, _wait.default)();

            await this.render(Ember.HTMLBars.template({
                "id": "Rk4Zappf",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-psm-tags-input\",null,[[\"post\"],[[22,[\"post\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            await (0, _helpers.clickTrigger)();

            let options = (0, _emberNativeDomHelpers.findAll)('.ember-power-select-option');
            (0, _chai.expect)(options.length).to.equal(4);
            (0, _chai.expect)(options[0].textContent).to.have.string('Tag One');
            (0, _chai.expect)(options[1].textContent).to.have.string('Tag Two');
            (0, _chai.expect)(options[2].textContent).to.have.string('Tag Three');
            (0, _chai.expect)(options[3].textContent).to.have.string('#Internal Tag');
        });

        (0, _mocha.it)('matches options on lowercase tag names', async function () {
            Ember.run(() => {
                this.set('post', this.get('store').findRecord('post', 1));
            });
            await (0, _wait.default)();

            await this.render(Ember.HTMLBars.template({
                "id": "Rk4Zappf",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-psm-tags-input\",null,[[\"post\"],[[22,[\"post\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            await (0, _helpers.clickTrigger)();
            await (0, _helpers.typeInSearch)('two');

            let options = (0, _emberNativeDomHelpers.findAll)('.ember-power-select-option');
            (0, _chai.expect)(options.length).to.equal(2);
            (0, _chai.expect)(options[0].textContent).to.have.string('Add "two"...');
            (0, _chai.expect)(options[1].textContent).to.have.string('Tag Two');
        });

        (0, _mocha.it)('hides create option on exact matches', async function () {
            Ember.run(() => {
                this.set('post', this.get('store').findRecord('post', 1));
            });
            await (0, _wait.default)();

            await this.render(Ember.HTMLBars.template({
                "id": "Rk4Zappf",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-psm-tags-input\",null,[[\"post\"],[[22,[\"post\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            await (0, _helpers.clickTrigger)();
            await (0, _helpers.typeInSearch)('Tag Two');

            let options = (0, _emberNativeDomHelpers.findAll)('.ember-power-select-option');
            (0, _chai.expect)(options.length).to.equal(1);
            (0, _chai.expect)(options[0].textContent).to.have.string('Tag Two');
        });

        (0, _mocha.describe)('primary tags', function () {
            (0, _mocha.it)('adds primary tag class to first tag', async function () {
                Ember.run(() => {
                    assignPostWithTags(this, 'one', 'three');
                });
                await (0, _wait.default)();

                await this.render(Ember.HTMLBars.template({
                    "id": "Rk4Zappf",
                    "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-psm-tags-input\",null,[[\"post\"],[[22,[\"post\"]]]]],false]],\"hasEval\":false}",
                    "meta": {}
                }));

                let selected = (0, _emberNativeDomHelpers.findAll)('.tag-token');
                (0, _chai.expect)(selected.length).to.equal(2);
                (0, _chai.expect)(selected[0].classList.contains('tag-token--primary')).to.be.true;
                (0, _chai.expect)(selected[1].classList.contains('tag-token--primary')).to.be.false;
            });

            (0, _mocha.it)('doesn\'t add primary tag class if first tag is internal', async function () {
                Ember.run(() => {
                    assignPostWithTags(this, 'internal', 'two');
                });
                await (0, _wait.default)();

                await this.render(Ember.HTMLBars.template({
                    "id": "Rk4Zappf",
                    "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-psm-tags-input\",null,[[\"post\"],[[22,[\"post\"]]]]],false]],\"hasEval\":false}",
                    "meta": {}
                }));

                let selected = (0, _emberNativeDomHelpers.findAll)('.tag-token');
                (0, _chai.expect)(selected.length).to.equal(2);
                (0, _chai.expect)(selected[0].classList.contains('tag-token--primary')).to.be.false;
                (0, _chai.expect)(selected[1].classList.contains('tag-token--primary')).to.be.false;
            });
        });

        (0, _mocha.describe)('updateTags', function () {
            (0, _mocha.it)('modifies post.tags', async function () {
                Ember.run(() => {
                    assignPostWithTags(this, 'internal', 'two');
                });
                await (0, _wait.default)();

                await this.render(Ember.HTMLBars.template({
                    "id": "Rk4Zappf",
                    "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-psm-tags-input\",null,[[\"post\"],[[22,[\"post\"]]]]],false]],\"hasEval\":false}",
                    "meta": {}
                }));
                await (0, _helpers.selectChoose)('.ember-power-select-trigger', 'Tag One');

                (0, _chai.expect)(this.get('post.tags').mapBy('name').join(',')).to.equal('#Internal Tag,Tag Two,Tag One');
            });

            (0, _mocha.it)('destroys new tag records when not selected', async function () {
                Ember.run(() => {
                    assignPostWithTags(this, 'internal', 'two');
                });
                await (0, _wait.default)();

                await this.render(Ember.HTMLBars.template({
                    "id": "Rk4Zappf",
                    "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-psm-tags-input\",null,[[\"post\"],[[22,[\"post\"]]]]],false]],\"hasEval\":false}",
                    "meta": {}
                }));
                await (0, _helpers.clickTrigger)();
                await (0, _helpers.typeInSearch)('New');
                await (0, _helpers.selectChoose)('.ember-power-select-trigger', 'Add "New"...');

                let tags = await this.get('store').peekAll('tag');
                (0, _chai.expect)(tags.get('length')).to.equal(5);

                let removeBtns = (0, _emberNativeDomHelpers.findAll)('.ember-power-select-multiple-remove-btn');
                await (0, _emberNativeDomHelpers.click)(removeBtns[removeBtns.length - 1]);

                tags = await this.get('store').peekAll('tag');
                (0, _chai.expect)(tags.get('length')).to.equal(4);
            });
        });

        (0, _mocha.describe)('createTag', function () {
            (0, _mocha.it)('creates new records', async function () {
                Ember.run(() => {
                    assignPostWithTags(this, 'internal', 'two');
                });
                await (0, _wait.default)();

                await this.render(Ember.HTMLBars.template({
                    "id": "Rk4Zappf",
                    "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-psm-tags-input\",null,[[\"post\"],[[22,[\"post\"]]]]],false]],\"hasEval\":false}",
                    "meta": {}
                }));
                await (0, _helpers.clickTrigger)();
                await (0, _helpers.typeInSearch)('New One');
                await (0, _helpers.selectChoose)('.ember-power-select-trigger', 'Add "New One"...');
                await (0, _helpers.typeInSearch)('New Two');
                await (0, _helpers.selectChoose)('.ember-power-select-trigger', 'Add "New Two"...');

                let tags = await this.get('store').peekAll('tag');
                (0, _chai.expect)(tags.get('length')).to.equal(6);

                (0, _chai.expect)(tags.findBy('name', 'New One').get('isNew')).to.be.true;
                (0, _chai.expect)(tags.findBy('name', 'New Two').get('isNew')).to.be.true;
            });
        });
    });
});
define('ghost-admin/tests/integration/components/gh-psm-template-select-test', ['ghost-admin/mirage/config/themes', 'ember-test-helpers/wait', 'mocha', 'chai', 'ember-native-dom-helpers', 'ember-mocha', 'ghost-admin/initializers/ember-cli-mirage'], function (_themes, _wait, _mocha, _chai, _emberNativeDomHelpers, _emberMocha, _emberCliMirage) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: gh-psm-template-select', function () {
        (0, _emberMocha.setupComponentTest)('gh-psm-template-select', {
            integration: true
        });

        let server;

        beforeEach(function () {
            server = (0, _emberCliMirage.startMirage)();

            server.create('theme', {
                active: true,
                name: 'example-theme',
                package: {
                    name: 'Example Theme',
                    version: '0.1'
                },
                templates: [{
                    filename: 'custom-news-bulletin.hbs',
                    name: 'News Bulletin',
                    for: ['post', 'page'],
                    slug: null
                }, {
                    filename: 'custom-big-images.hbs',
                    name: 'Big Images',
                    for: ['post', 'page'],
                    slug: null
                }, {
                    filename: 'post-one.hbs',
                    name: 'One',
                    for: ['post'],
                    slug: 'one'
                }, {
                    filename: 'page-about.hbs',
                    name: 'About',
                    for: ['page'],
                    slug: 'about'
                }]
            });

            (0, _themes.default)(server);
        });

        afterEach(function () {
            server.shutdown();
        });

        (0, _mocha.it)('disables template selector if slug matches post template', async function () {
            this.set('post', {
                slug: 'one',
                page: false
            });

            this.render(Ember.HTMLBars.template({
                "id": "8yHIgmD7",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-psm-template-select\",null,[[\"post\"],[[22,[\"post\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            await (0, _wait.default)();

            (0, _chai.expect)((0, _emberNativeDomHelpers.find)('select').disabled, 'select is disabled').to.be.true;
            (0, _chai.expect)((0, _emberNativeDomHelpers.find)('p').textContent).to.have.string('post-one.hbs');
        });

        (0, _mocha.it)('disables template selector if slug matches page template', async function () {
            this.set('post', {
                slug: 'about',
                page: true
            });

            this.render(Ember.HTMLBars.template({
                "id": "8yHIgmD7",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-psm-template-select\",null,[[\"post\"],[[22,[\"post\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            await (0, _wait.default)();

            (0, _chai.expect)((0, _emberNativeDomHelpers.find)('select').disabled, 'select is disabled').to.be.true;
            (0, _chai.expect)((0, _emberNativeDomHelpers.find)('p').textContent).to.have.string('page-about.hbs');
        });
    });
});
define('ghost-admin/tests/integration/components/gh-publishmenu-draft-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: gh-publishmenu-draft', function () {
        (0, _emberMocha.setupComponentTest)('gh-publishmenu-draft', {
            integration: true
        });

        _mocha.it.skip('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#gh-publishmenu-draft}}
            //     template content
            //   {{/gh-publishmenu-draft}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "jDLz4CIQ",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"gh-publishmenu-draft\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/gh-publishmenu-published-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: gh-publishmenu-published', function () {
        (0, _emberMocha.setupComponentTest)('gh-publishmenu-published', {
            integration: true
        });

        _mocha.it.skip('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#gh-publishmenu-published}}
            //     template content
            //   {{/gh-publishmenu-published}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "jJ2x0iB3",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"gh-publishmenu-published\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/gh-publishmenu-scheduled-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: gh-publishmenu-scheduled', function () {
        (0, _emberMocha.setupComponentTest)('gh-publishmenu-scheduled', {
            integration: true
        });

        _mocha.it.skip('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#gh-publishmenu-scheduled}}
            //     template content
            //   {{/gh-publishmenu-scheduled}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "VkyNzltE",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"gh-publishmenu-scheduled\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/gh-publishmenu-test', ['mocha', 'chai', 'ember-mocha', 'ghost-admin/initializers/ember-cli-mirage'], function (_mocha, _chai, _emberMocha, _emberCliMirage) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: gh-publishmenu', function () {
        (0, _emberMocha.setupComponentTest)('gh-publishmenu', {
            integration: true
        });

        let server;

        beforeEach(function () {
            server = (0, _emberCliMirage.startMirage)();
            server.loadFixtures();

            server.create('user');
        });

        afterEach(function () {
            server.shutdown();
        });

        (0, _mocha.it)('renders', function () {
            this.post = server.create('post');
            this.render(Ember.HTMLBars.template({
                "id": "w4hAgluB",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-publishmenu\",null,[[\"post\"],[[22,[\"post\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/gh-search-input-test', ['pretender', 'ember-test-helpers/wait', 'mocha', 'chai', 'ember-mocha'], function (_pretender, _wait, _mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: gh-search-input', function () {
        (0, _emberMocha.setupComponentTest)('gh-search-input', {
            integration: true
        });

        let server;

        beforeEach(function () {
            server = new _pretender.default();
        });

        afterEach(function () {
            server.shutdown();
        });

        (0, _mocha.it)('renders', function () {
            // renders the component on the page
            this.render(Ember.HTMLBars.template({
                "id": "bNiam3HI",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"gh-search-input\"],false]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _chai.expect)(this.$('.ember-power-select-search input')).to.have.length(1);
        });

        (0, _mocha.it)('opens the dropdown on text entry', function (done) {
            this.render(Ember.HTMLBars.template({
                "id": "bNiam3HI",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"gh-search-input\"],false]],\"hasEval\":false}",
                "meta": {}
            }));

            // enter text to trigger search
            Ember.run(() => {
                this.$('input[type="search"]').val('test').trigger('input');
            });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(this.$('.ember-basic-dropdown-content').length).to.equal(1);
                done();
            });
        });
    });
});
define('ghost-admin/tests/integration/components/gh-simplemde-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: gh-simplemde', function () {
        (0, _emberMocha.setupComponentTest)('gh-simplemde', {
            integration: true
        });

        (0, _mocha.it)('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#gh-simplemde}}
            //     template content
            //   {{/gh-simplemde}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "tVFVPePP",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"gh-simplemde\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/gh-subscribers-table-test', ['ember-light-table', 'mocha', 'chai', 'ember-mocha'], function (_emberLightTable, _mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: gh-subscribers-table', function () {
        (0, _emberMocha.setupComponentTest)('gh-subscribers-table', {
            integration: true
        });

        (0, _mocha.it)('renders', function () {
            this.set('table', new _emberLightTable.default([], []));
            this.set('sortByColumn', function () {});
            this.set('delete', function () {});

            this.render(Ember.HTMLBars.template({
                "id": "u6W1UKC+",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-subscribers-table\",null,[[\"table\",\"sortByColumn\",\"delete\"],[[22,[\"table\"]],[26,\"action\",[[21,0,[]],[22,[\"sortByColumn\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"delete\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/gh-tag-settings-form-test', ['ember-data', 'ember-test-helpers/wait', 'mocha', 'chai', 'ember-mocha'], function (_emberData, _wait, _mocha, _chai, _emberMocha) {
    'use strict';

    const Errors = _emberData.default.Errors;


    let configStub = Ember.Service.extend({
        blogUrl: 'http://localhost:2368'
    });

    let mediaQueriesStub = Ember.Service.extend({
        maxWidth600: false
    });

    (0, _mocha.describe)('Integration: Component: gh-tag-settings-form', function () {
        (0, _emberMocha.setupComponentTest)('gh-tag-settings-form', {
            integration: true
        });

        beforeEach(function () {
            /* eslint-disable camelcase */
            let tag = Ember.Object.create({
                id: 1,
                name: 'Test',
                slug: 'test',
                description: 'Description.',
                metaTitle: 'Meta Title',
                metaDescription: 'Meta description',
                errors: Errors.create(),
                hasValidated: []
            });
            /* eslint-enable camelcase */

            this.set('tag', tag);
            this.set('actions.setProperty', function (property, value) {
                // this should be overridden if a call is expected
                // eslint-disable-next-line no-console
                console.error(`setProperty called '${property}: ${value}'`);
            });

            this.register('service:config', configStub);
            this.inject.service('config', { as: 'config' });

            this.register('service:media-queries', mediaQueriesStub);
            this.inject.service('media-queries', { as: 'mediaQueries' });
        });

        (0, _mocha.it)('renders', function () {
            this.render(Ember.HTMLBars.template({
                "id": "WwQnh6b7",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-tag-settings-form\",null,[[\"tag\",\"setProperty\"],[[22,[\"tag\"]],[26,\"action\",[[21,0,[]],\"setProperty\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });

        (0, _mocha.it)('has the correct title', function () {
            this.render(Ember.HTMLBars.template({
                "id": "WwQnh6b7",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-tag-settings-form\",null,[[\"tag\",\"setProperty\"],[[22,[\"tag\"]],[26,\"action\",[[21,0,[]],\"setProperty\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$('.tag-settings-pane h4').text(), 'existing tag title').to.equal('Tag Settings');

            this.set('tag.isNew', true);
            (0, _chai.expect)(this.$('.tag-settings-pane h4').text(), 'new tag title').to.equal('New Tag');
        });

        (0, _mocha.it)('renders main settings', function () {
            this.render(Ember.HTMLBars.template({
                "id": "WwQnh6b7",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-tag-settings-form\",null,[[\"tag\",\"setProperty\"],[[22,[\"tag\"]],[26,\"action\",[[21,0,[]],\"setProperty\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _chai.expect)(this.$('.gh-image-uploader').length, 'displays image uploader').to.equal(1);
            (0, _chai.expect)(this.$('input[name="name"]').val(), 'name field value').to.equal('Test');
            (0, _chai.expect)(this.$('input[name="slug"]').val(), 'slug field value').to.equal('test');
            (0, _chai.expect)(this.$('textarea[name="description"]').val(), 'description field value').to.equal('Description.');
            (0, _chai.expect)(this.$('input[name="metaTitle"]').val(), 'metaTitle field value').to.equal('Meta Title');
            (0, _chai.expect)(this.$('textarea[name="metaDescription"]').val(), 'metaDescription field value').to.equal('Meta description');
        });

        (0, _mocha.it)('can switch between main/meta settings', function () {
            this.render(Ember.HTMLBars.template({
                "id": "WwQnh6b7",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-tag-settings-form\",null,[[\"tag\",\"setProperty\"],[[22,[\"tag\"]],[26,\"action\",[[21,0,[]],\"setProperty\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _chai.expect)(this.$('.tag-settings-pane').hasClass('settings-menu-pane-in'), 'main settings are displayed by default').to.be.true;
            (0, _chai.expect)(this.$('.tag-meta-settings-pane').hasClass('settings-menu-pane-out-right'), 'meta settings are hidden by default').to.be.true;

            Ember.run(() => {
                this.$('.meta-data-button').click();
            });

            (0, _chai.expect)(this.$('.tag-settings-pane').hasClass('settings-menu-pane-out-left'), 'main settings are hidden after clicking Meta Data button').to.be.true;
            (0, _chai.expect)(this.$('.tag-meta-settings-pane').hasClass('settings-menu-pane-in'), 'meta settings are displayed after clicking Meta Data button').to.be.true;

            Ember.run(() => {
                this.$('.back').click();
            });

            (0, _chai.expect)(this.$('.tag-settings-pane').hasClass('settings-menu-pane-in'), 'main settings are displayed after clicking "back"').to.be.true;
            (0, _chai.expect)(this.$('.tag-meta-settings-pane').hasClass('settings-menu-pane-out-right'), 'meta settings are hidden after clicking "back"').to.be.true;
        });

        (0, _mocha.it)('has one-way binding for properties', function () {
            this.set('actions.setProperty', function () {
                // noop
            });

            this.render(Ember.HTMLBars.template({
                "id": "WwQnh6b7",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-tag-settings-form\",null,[[\"tag\",\"setProperty\"],[[22,[\"tag\"]],[26,\"action\",[[21,0,[]],\"setProperty\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));

            Ember.run(() => {
                this.$('input[name="name"]').val('New name');
                this.$('input[name="slug"]').val('new-slug');
                this.$('textarea[name="description"]').val('New description');
                this.$('input[name="metaTitle"]').val('New metaTitle');
                this.$('textarea[name="metaDescription"]').val('New metaDescription');
            });

            (0, _chai.expect)(this.get('tag.name'), 'tag name').to.equal('Test');
            (0, _chai.expect)(this.get('tag.slug'), 'tag slug').to.equal('test');
            (0, _chai.expect)(this.get('tag.description'), 'tag description').to.equal('Description.');
            (0, _chai.expect)(this.get('tag.metaTitle'), 'tag metaTitle').to.equal('Meta Title');
            (0, _chai.expect)(this.get('tag.metaDescription'), 'tag metaDescription').to.equal('Meta description');
        });

        (0, _mocha.it)('triggers setProperty action on blur of all fields', function () {
            let expectedProperty = '';
            let expectedValue = '';

            this.set('actions.setProperty', function (property, value) {
                (0, _chai.expect)(property, 'property').to.equal(expectedProperty);
                (0, _chai.expect)(value, 'value').to.equal(expectedValue);
            });

            this.render(Ember.HTMLBars.template({
                "id": "WwQnh6b7",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-tag-settings-form\",null,[[\"tag\",\"setProperty\"],[[22,[\"tag\"]],[26,\"action\",[[21,0,[]],\"setProperty\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));

            expectedProperty = 'name';
            expectedValue = 'new-slug';
            Ember.run(() => {
                this.$('input[name="name"]').val('New name');
            });

            expectedProperty = 'url';
            expectedValue = 'new-slug';
            Ember.run(() => {
                this.$('input[name="slug"]').val('new-slug');
            });

            expectedProperty = 'description';
            expectedValue = 'New description';
            Ember.run(() => {
                this.$('textarea[name="description"]').val('New description');
            });

            expectedProperty = 'metaTitle';
            expectedValue = 'New metaTitle';
            Ember.run(() => {
                this.$('input[name="metaTitle"]').val('New metaTitle');
            });

            expectedProperty = 'metaDescription';
            expectedValue = 'New metaDescription';
            Ember.run(() => {
                this.$('textarea[name="metaDescription"]').val('New metaDescription');
            });
        });

        (0, _mocha.it)('displays error messages for validated fields', function () {
            let errors = this.get('tag.errors');
            let hasValidated = this.get('tag.hasValidated');

            errors.add('name', 'must be present');
            hasValidated.push('name');

            errors.add('slug', 'must be present');
            hasValidated.push('slug');

            errors.add('description', 'is too long');
            hasValidated.push('description');

            errors.add('metaTitle', 'is too long');
            hasValidated.push('metaTitle');

            errors.add('metaDescription', 'is too long');
            hasValidated.push('metaDescription');

            this.render(Ember.HTMLBars.template({
                "id": "WwQnh6b7",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-tag-settings-form\",null,[[\"tag\",\"setProperty\"],[[22,[\"tag\"]],[26,\"action\",[[21,0,[]],\"setProperty\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));

            return (0, _wait.default)().then(() => {
                let nameFormGroup = this.$('input[name="name"]').closest('.form-group');
                (0, _chai.expect)(nameFormGroup.hasClass('error'), 'name form group has error state').to.be.true;
                (0, _chai.expect)(nameFormGroup.find('.response').length, 'name form group has error message').to.equal(1);

                let slugFormGroup = this.$('input[name="slug"]').closest('.form-group');
                (0, _chai.expect)(slugFormGroup.hasClass('error'), 'slug form group has error state').to.be.true;
                (0, _chai.expect)(slugFormGroup.find('.response').length, 'slug form group has error message').to.equal(1);

                let descriptionFormGroup = this.$('textarea[name="description"]').closest('.form-group');
                (0, _chai.expect)(descriptionFormGroup.hasClass('error'), 'description form group has error state').to.be.true;

                let metaTitleFormGroup = this.$('input[name="metaTitle"]').closest('.form-group');
                (0, _chai.expect)(metaTitleFormGroup.hasClass('error'), 'metaTitle form group has error state').to.be.true;
                (0, _chai.expect)(metaTitleFormGroup.find('.response').length, 'metaTitle form group has error message').to.equal(1);

                let metaDescriptionFormGroup = this.$('textarea[name="metaDescription"]').closest('.form-group');
                (0, _chai.expect)(metaDescriptionFormGroup.hasClass('error'), 'metaDescription form group has error state').to.be.true;
                (0, _chai.expect)(metaDescriptionFormGroup.find('.response').length, 'metaDescription form group has error message').to.equal(1);
            });
        });

        (0, _mocha.it)('displays char count for text fields', function () {
            this.render(Ember.HTMLBars.template({
                "id": "WwQnh6b7",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-tag-settings-form\",null,[[\"tag\",\"setProperty\"],[[22,[\"tag\"]],[26,\"action\",[[21,0,[]],\"setProperty\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));

            let descriptionFormGroup = this.$('textarea[name="description"]').closest('.form-group');
            (0, _chai.expect)(descriptionFormGroup.find('.word-count').text(), 'description char count').to.equal('12');

            let metaDescriptionFormGroup = this.$('textarea[name="metaDescription"]').closest('.form-group');
            (0, _chai.expect)(metaDescriptionFormGroup.find('.word-count').text(), 'description char count').to.equal('16');
        });

        (0, _mocha.it)('renders SEO title preview', function () {
            this.render(Ember.HTMLBars.template({
                "id": "WwQnh6b7",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-tag-settings-form\",null,[[\"tag\",\"setProperty\"],[[22,[\"tag\"]],[26,\"action\",[[21,0,[]],\"setProperty\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$('.seo-preview-title').text(), 'displays meta title if present').to.equal('Meta Title');

            Ember.run(() => {
                this.set('tag.metaTitle', '');
            });
            (0, _chai.expect)(this.$('.seo-preview-title').text(), 'falls back to tag name without metaTitle').to.equal('Test');

            Ember.run(() => {
                this.set('tag.name', new Array(151).join('x'));
            });
            let expectedLength = 70 + '…'.length;
            (0, _chai.expect)(this.$('.seo-preview-title').text().length, 'cuts title to max 70 chars').to.equal(expectedLength);
        });

        (0, _mocha.it)('renders SEO URL preview', function () {
            this.render(Ember.HTMLBars.template({
                "id": "WwQnh6b7",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-tag-settings-form\",null,[[\"tag\",\"setProperty\"],[[22,[\"tag\"]],[26,\"action\",[[21,0,[]],\"setProperty\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$('.seo-preview-link').text(), 'adds url and tag prefix').to.equal('http://localhost:2368/tag/test/');

            Ember.run(() => {
                this.set('tag.slug', new Array(151).join('x'));
            });
            let expectedLength = 70 + '…'.length;
            (0, _chai.expect)(this.$('.seo-preview-link').text().length, 'cuts slug to max 70 chars').to.equal(expectedLength);
        });

        (0, _mocha.it)('renders SEO description preview', function () {
            this.render(Ember.HTMLBars.template({
                "id": "WwQnh6b7",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-tag-settings-form\",null,[[\"tag\",\"setProperty\"],[[22,[\"tag\"]],[26,\"action\",[[21,0,[]],\"setProperty\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$('.seo-preview-description').text(), 'displays meta description if present').to.equal('Meta description');

            Ember.run(() => {
                this.set('tag.metaDescription', '');
            });
            (0, _chai.expect)(this.$('.seo-preview-description').text(), 'falls back to tag description without metaDescription').to.equal('Description.');

            Ember.run(() => {
                this.set('tag.description', new Array(500).join('x'));
            });
            let expectedLength = 156 + '…'.length;
            (0, _chai.expect)(this.$('.seo-preview-description').text().length, 'cuts description to max 156 chars').to.equal(expectedLength);
        });

        (0, _mocha.it)('resets if a new tag is received', function () {
            this.render(Ember.HTMLBars.template({
                "id": "WwQnh6b7",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-tag-settings-form\",null,[[\"tag\",\"setProperty\"],[[22,[\"tag\"]],[26,\"action\",[[21,0,[]],\"setProperty\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            Ember.run(() => {
                this.$('.meta-data-button').click();
            });
            (0, _chai.expect)(this.$('.tag-meta-settings-pane').hasClass('settings-menu-pane-in'), 'meta data pane is shown').to.be.true;

            Ember.run(() => {
                this.set('tag', Ember.Object.create({ id: '2' }));
            });
            (0, _chai.expect)(this.$('.tag-settings-pane').hasClass('settings-menu-pane-in'), 'resets to main settings').to.be.true;
        });

        (0, _mocha.it)('triggers delete tag modal on delete click', function (done) {
            // TODO: will time out if this isn't hit, there's probably a better
            // way of testing this
            this.set('actions.openModal', () => {
                done();
            });

            this.render(Ember.HTMLBars.template({
                "id": "zYXBiBmd",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-tag-settings-form\",null,[[\"tag\",\"setProperty\",\"showDeleteTagModal\"],[[22,[\"tag\"]],[26,\"action\",[[21,0,[]],\"setProperty\"],null],[26,\"action\",[[21,0,[]],\"openModal\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));

            Ember.run(() => {
                this.$('.settings-menu-delete-button').click();
            });
        });

        (0, _mocha.it)('shows settings.tags arrow link on mobile', function () {
            this.set('mediaQueries.maxWidth600', true);

            this.render(Ember.HTMLBars.template({
                "id": "WwQnh6b7",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[1,[26,\"gh-tag-settings-form\",null,[[\"tag\",\"setProperty\"],[[22,[\"tag\"]],[26,\"action\",[[21,0,[]],\"setProperty\"],null]]]],false],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _chai.expect)(this.$('.tag-settings-pane .settings-menu-header .settings-menu-header-action').length, 'settings.tags link is shown').to.equal(1);
        });
    });
});
define('ghost-admin/tests/integration/components/gh-tags-management-container-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: gh-tags-management-container', function () {
        (0, _emberMocha.setupComponentTest)('gh-tags-management-container', {
            integration: true
        });

        (0, _mocha.it)('renders', function () {
            this.set('tags', []);
            this.set('selectedTag', null);
            this.on('enteredMobile', function () {
                // noop
            });
            this.on('leftMobile', function () {
                // noop
            });

            this.render(Ember.HTMLBars.template({
                "id": "pT17tDVW",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n            \"],[4,\"gh-tags-management-container\",null,[[\"tags\",\"selectedTag\",\"enteredMobile\",\"leftMobile\"],[[22,[\"tags\"]],[22,[\"selectedTag\"]],\"enteredMobile\",[26,\"action\",[[21,0,[]],\"leftMobile\"],null]]],{\"statements\":[],\"parameters\":[]},null],[0,\"\\n        \"]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/gh-task-button-test', ['ember-test-helpers/wait', 'mocha', 'chai', 'ember-mocha', 'ember-concurrency'], function (_wait, _mocha, _chai, _emberMocha, _emberConcurrency) {
    'use strict';

    var _slicedToArray = function () {
        function sliceIterator(arr, i) {
            var _arr = [];
            var _n = true;
            var _d = false;
            var _e = undefined;

            try {
                for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
                    _arr.push(_s.value);

                    if (i && _arr.length === i) break;
                }
            } catch (err) {
                _d = true;
                _e = err;
            } finally {
                try {
                    if (!_n && _i["return"]) _i["return"]();
                } finally {
                    if (_d) throw _e;
                }
            }

            return _arr;
        }

        return function (arr, i) {
            if (Array.isArray(arr)) {
                return arr;
            } else if (Symbol.iterator in Object(arr)) {
                return sliceIterator(arr, i);
            } else {
                throw new TypeError("Invalid attempt to destructure non-iterable instance");
            }
        };
    }();

    (0, _mocha.describe)('Integration: Component: gh-task-button', function () {
        (0, _emberMocha.setupComponentTest)('gh-task-button', {
            integration: true
        });

        (0, _mocha.it)('renders', function () {
            // sets button text using positional param
            this.render(Ember.HTMLBars.template({
                "id": "7ax6jvJ2",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-task-button\",[\"Test\"],null],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$('button')).to.exist;
            (0, _chai.expect)(this.$('button')).to.contain('Test');
            (0, _chai.expect)(this.$('button')).to.have.prop('disabled', false);

            this.render(Ember.HTMLBars.template({
                "id": "Tgxgq6oR",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-task-button\",null,[[\"class\"],[\"testing\"]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$('button')).to.have.class('testing');
            // default button text is "Save"
            (0, _chai.expect)(this.$('button')).to.contain('Save');

            // passes disabled attr
            this.render(Ember.HTMLBars.template({
                "id": "0UpXt1KI",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-task-button\",null,[[\"disabled\",\"buttonText\"],[true,\"Test\"]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$('button')).to.have.prop('disabled', true);
            // allows button text to be set via hash param
            (0, _chai.expect)(this.$('button')).to.contain('Test');

            // passes type attr
            this.render(Ember.HTMLBars.template({
                "id": "z68xerzo",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-task-button\",null,[[\"type\"],[\"submit\"]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$('button')).to.have.attr('type', 'submit');

            // passes tabindex attr
            this.render(Ember.HTMLBars.template({
                "id": "Bk1Xn2ib",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-task-button\",null,[[\"tabindex\"],[\"-1\"]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$('button')).to.have.attr('tabindex', '-1');
        });

        (0, _mocha.it)('shows spinner whilst running', function () {
            this.set('myTask', (0, _emberConcurrency.task)(function* () {
                yield (0, _emberConcurrency.timeout)(50);
            }));

            this.render(Ember.HTMLBars.template({
                "id": "jSc3h/2T",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-task-button\",null,[[\"task\"],[[22,[\"myTask\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            this.get('myTask').perform();

            Ember.run.later(this, function () {
                (0, _chai.expect)(this.$('button')).to.have.descendants('svg');
            }, 20);

            return (0, _wait.default)();
        });

        (0, _mocha.it)('shows running text when passed whilst running', function () {
            this.set('myTask', (0, _emberConcurrency.task)(function* () {
                yield (0, _emberConcurrency.timeout)(50);
            }));

            this.render(Ember.HTMLBars.template({
                "id": "I10Dy63a",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-task-button\",null,[[\"task\",\"runningText\"],[[22,[\"myTask\"]],\"Running\"]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            this.get('myTask').perform();

            Ember.run.later(this, function () {
                (0, _chai.expect)(this.$('button')).to.have.descendants('svg');
                (0, _chai.expect)(this.$('button')).to.contain('Running');
            }, 20);

            return (0, _wait.default)();
        });

        (0, _mocha.it)('appears disabled whilst running', function () {
            this.set('myTask', (0, _emberConcurrency.task)(function* () {
                yield (0, _emberConcurrency.timeout)(50);
            }));

            this.render(Ember.HTMLBars.template({
                "id": "jSc3h/2T",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-task-button\",null,[[\"task\"],[[22,[\"myTask\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$('button'), 'initial class').to.not.have.class('appear-disabled');

            this.get('myTask').perform();

            Ember.run.later(this, function () {
                (0, _chai.expect)(this.$('button'), 'running class').to.have.class('appear-disabled');
            }, 20);

            Ember.run.later(this, function () {
                (0, _chai.expect)(this.$('button'), 'ended class').to.not.have.class('appear-disabled');
            }, 100);

            return (0, _wait.default)();
        });

        (0, _mocha.it)('shows success on success', function () {
            this.set('myTask', (0, _emberConcurrency.task)(function* () {
                yield (0, _emberConcurrency.timeout)(50);
                return true;
            }));

            this.render(Ember.HTMLBars.template({
                "id": "jSc3h/2T",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-task-button\",null,[[\"task\"],[[22,[\"myTask\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            this.get('myTask').perform();

            Ember.run.later(this, function () {
                (0, _chai.expect)(this.$('button')).to.have.class('gh-btn-green');
                (0, _chai.expect)(this.$('button')).to.contain('Saved');
            }, 100);

            return (0, _wait.default)();
        });

        (0, _mocha.it)('assigns specified success class on success', function () {
            this.set('myTask', (0, _emberConcurrency.task)(function* () {
                yield (0, _emberConcurrency.timeout)(50);
                return true;
            }));

            this.render(Ember.HTMLBars.template({
                "id": "DtokeBjx",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-task-button\",null,[[\"task\",\"successClass\"],[[22,[\"myTask\"]],\"im-a-success\"]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            this.get('myTask').perform();

            Ember.run.later(this, function () {
                (0, _chai.expect)(this.$('button')).to.not.have.class('gh-btn-green');
                (0, _chai.expect)(this.$('button')).to.have.class('im-a-success');
                (0, _chai.expect)(this.$('button')).to.contain('Saved');
            }, 100);

            return (0, _wait.default)();
        });

        (0, _mocha.it)('shows failure when task errors', function () {
            this.set('myTask', (0, _emberConcurrency.task)(function* () {
                try {
                    yield (0, _emberConcurrency.timeout)(50);
                    throw new ReferenceError('test error');
                } catch (error) {
                    // noop, prevent mocha triggering unhandled error assert
                }
            }));

            this.render(Ember.HTMLBars.template({
                "id": "jSc3h/2T",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-task-button\",null,[[\"task\"],[[22,[\"myTask\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            this.get('myTask').perform();

            Ember.run.later(this, function () {
                (0, _chai.expect)(this.$('button')).to.have.class('gh-btn-red');
                (0, _chai.expect)(this.$('button')).to.contain('Retry');
            }, 100);

            return (0, _wait.default)();
        });

        (0, _mocha.it)('shows failure on falsy response', function () {
            this.set('myTask', (0, _emberConcurrency.task)(function* () {
                yield (0, _emberConcurrency.timeout)(50);
                return false;
            }));

            this.render(Ember.HTMLBars.template({
                "id": "jSc3h/2T",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-task-button\",null,[[\"task\"],[[22,[\"myTask\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            this.get('myTask').perform();

            Ember.run.later(this, function () {
                (0, _chai.expect)(this.$('button')).to.have.class('gh-btn-red');
                (0, _chai.expect)(this.$('button')).to.contain('Retry');
            }, 100);

            return (0, _wait.default)();
        });

        (0, _mocha.it)('assigns specified failure class on failure', function () {
            this.set('myTask', (0, _emberConcurrency.task)(function* () {
                yield (0, _emberConcurrency.timeout)(50);
                return false;
            }));

            this.render(Ember.HTMLBars.template({
                "id": "AbYqzY/t",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-task-button\",null,[[\"task\",\"failureClass\"],[[22,[\"myTask\"]],\"im-a-failure\"]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            this.get('myTask').perform();

            Ember.run.later(this, function () {
                (0, _chai.expect)(this.$('button')).to.not.have.class('gh-btn-red');
                (0, _chai.expect)(this.$('button')).to.have.class('im-a-failure');
                (0, _chai.expect)(this.$('button')).to.contain('Retry');
            }, 100);

            return (0, _wait.default)();
        });

        (0, _mocha.it)('performs task on click', function () {
            let taskCount = 0;

            this.set('myTask', (0, _emberConcurrency.task)(function* () {
                yield (0, _emberConcurrency.timeout)(50);
                taskCount = taskCount + 1;
            }));

            this.render(Ember.HTMLBars.template({
                "id": "jSc3h/2T",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-task-button\",null,[[\"task\"],[[22,[\"myTask\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            this.$('button').click();

            return (0, _wait.default)().then(() => {
                (0, _chai.expect)(taskCount, 'taskCount').to.equal(1);
            });
        });

        _mocha.it.skip('keeps button size when showing spinner', function () {
            this.set('myTask', (0, _emberConcurrency.task)(function* () {
                yield (0, _emberConcurrency.timeout)(50);
            }));

            this.render(Ember.HTMLBars.template({
                "id": "jSc3h/2T",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-task-button\",null,[[\"task\"],[[22,[\"myTask\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            let width = this.$('button').width();
            let height = this.$('button').height();
            (0, _chai.expect)(this.$('button')).to.not.have.attr('style');

            this.get('myTask').perform();

            Ember.run.later(this, function () {
                var _width$toString$split = width.toString().split('.'),
                    _width$toString$split2 = _slicedToArray(_width$toString$split, 1);

                let widthInt = _width$toString$split2[0];

                var _height$toString$spli = height.toString().split('.'),
                    _height$toString$spli2 = _slicedToArray(_height$toString$spli, 1);

                let heightInt = _height$toString$spli2[0];


                (0, _chai.expect)(this.$('button').attr('style')).to.have.string(`width: ${widthInt}`);
                (0, _chai.expect)(this.$('button').attr('style')).to.have.string(`height: ${heightInt}`);
            }, 20);

            Ember.run.later(this, function () {
                // chai-jquery test doesn't work because Firefox outputs blank string
                // expect(this.$('button')).to.not.have.attr('style');
                (0, _chai.expect)(this.$('button').attr('style')).to.be.empty;
            }, 100);

            return (0, _wait.default)();
        });
    });
});
define('ghost-admin/tests/integration/components/gh-theme-table-test', ['sinon', 'mocha', 'chai', 'ember-mocha'], function (_sinon, _mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: gh-theme-table', function () {
        (0, _emberMocha.setupComponentTest)('gh-theme-table', {
            integration: true
        });

        (0, _mocha.it)('renders', function () {
            this.set('themes', [{ name: 'Daring', package: { name: 'Daring', version: '0.1.4' }, active: true }, { name: 'casper', package: { name: 'Casper', version: '1.3.1' } }, { name: 'oscar-ghost-1.1.0', package: { name: 'Lanyon', version: '1.1.0' } }, { name: 'foo' }]);
            this.set('actionHandler', _sinon.default.spy());

            this.render(Ember.HTMLBars.template({
                "id": "OTgB+ovz",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-theme-table\",null,[[\"themes\",\"activateTheme\",\"downloadTheme\",\"deleteTheme\"],[[22,[\"themes\"]],[26,\"action\",[[21,0,[]],[22,[\"actionHandler\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"actionHandler\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"actionHandler\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _chai.expect)(this.$('[data-test-themes-list]').length, 'themes list is present').to.equal(1);
            (0, _chai.expect)(this.$('[data-test-theme-id]').length, 'number of rows').to.equal(4);

            let packageNames = this.$('[data-test-theme-title]').map((i, name) => Ember.$(name).text().trim()).toArray();

            (0, _chai.expect)(packageNames, 'themes are ordered by label, casper has "default"').to.deep.equal(['Casper (default)', 'Daring', 'foo', 'Lanyon']);

            (0, _chai.expect)(this.$('[data-test-theme-active="true"]').find('[data-test-theme-title]').text().trim(), 'active theme is highlighted').to.equal('Daring');

            (0, _chai.expect)(this.$('[data-test-theme-activate-button]').length === 3, 'non-active themes have an activate link').to.be.true;

            (0, _chai.expect)(this.$('[data-test-theme-active="true"]').find('[data-test-theme-activate-button]').length === 0, 'active theme doesn\'t have an activate link').to.be.true;

            (0, _chai.expect)(this.$('[data-test-theme-download-button]').length, 'all themes have a download link').to.equal(4);

            (0, _chai.expect)(this.$('[data-test-theme-id="foo"]').find('[data-test-theme-delete-button]').length === 1, 'non-active, non-casper theme has delete link').to.be.true;

            (0, _chai.expect)(this.$('[data-test-theme-id="casper"]').find('[data-test-theme-delete-button]').length === 0, 'casper doesn\'t have delete link').to.be.true;

            (0, _chai.expect)(this.$('[data-test-theme-active="true"]').find('[data-test-theme-delete-button]').length === 0, 'active theme doesn\'t have delete link').to.be.true;
        });

        (0, _mocha.it)('delete link triggers passed in action', function () {
            let deleteAction = _sinon.default.spy();
            let actionHandler = _sinon.default.spy();

            this.set('themes', [{ name: 'Foo', active: true }, { name: 'Bar' }]);
            this.set('deleteAction', deleteAction);
            this.set('actionHandler', actionHandler);

            this.render(Ember.HTMLBars.template({
                "id": "juh3CNyH",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-theme-table\",null,[[\"themes\",\"activateTheme\",\"downloadTheme\",\"deleteTheme\"],[[22,[\"themes\"]],[26,\"action\",[[21,0,[]],[22,[\"actionHandler\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"actionHandler\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"deleteAction\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            Ember.run(() => {
                this.$('[data-test-theme-id="Bar"] [data-test-theme-delete-button]').click();
            });

            (0, _chai.expect)(deleteAction.calledOnce).to.be.true;
            (0, _chai.expect)(deleteAction.firstCall.args[0].name).to.equal('Bar');
        });

        (0, _mocha.it)('download link triggers passed in action', function () {
            let downloadAction = _sinon.default.spy();
            let actionHandler = _sinon.default.spy();

            this.set('themes', [{ name: 'Foo', active: true }, { name: 'Bar' }]);
            this.set('downloadAction', downloadAction);
            this.set('actionHandler', actionHandler);

            this.render(Ember.HTMLBars.template({
                "id": "qPh9Q6qu",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-theme-table\",null,[[\"themes\",\"activateTheme\",\"downloadTheme\",\"deleteTheme\"],[[22,[\"themes\"]],[26,\"action\",[[21,0,[]],[22,[\"actionHandler\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"downloadAction\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"actionHandler\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            Ember.run(() => {
                this.$('[data-test-theme-id="Foo"] [data-test-theme-download-button]').click();
            });

            (0, _chai.expect)(downloadAction.calledOnce).to.be.true;
            (0, _chai.expect)(downloadAction.firstCall.args[0].name).to.equal('Foo');
        });

        (0, _mocha.it)('activate link triggers passed in action', function () {
            let activateAction = _sinon.default.spy();
            let actionHandler = _sinon.default.spy();

            this.set('themes', [{ name: 'Foo', active: true }, { name: 'Bar' }]);
            this.set('activateAction', activateAction);
            this.set('actionHandler', actionHandler);

            this.render(Ember.HTMLBars.template({
                "id": "1dgKINPg",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-theme-table\",null,[[\"themes\",\"activateTheme\",\"downloadTheme\",\"deleteTheme\"],[[22,[\"themes\"]],[26,\"action\",[[21,0,[]],[22,[\"activateAction\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"actionHandler\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"actionHandler\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            Ember.run(() => {
                this.$('[data-test-theme-id="Bar"] [data-test-theme-activate-button]').click();
            });

            (0, _chai.expect)(activateAction.calledOnce).to.be.true;
            (0, _chai.expect)(activateAction.firstCall.args[0].name).to.equal('Bar');
        });

        (0, _mocha.it)('displays folder names if there are duplicate package names', function () {
            this.set('themes', [{ name: 'daring', package: { name: 'Daring', version: '0.1.4' }, active: true }, { name: 'daring-0.1.5', package: { name: 'Daring', version: '0.1.4' } }, { name: 'casper', package: { name: 'Casper', version: '1.3.1' } }, { name: 'another', package: { name: 'Casper', version: '1.3.1' } }, { name: 'mine', package: { name: 'Casper', version: '1.3.1' } }, { name: 'foo' }]);
            this.set('actionHandler', _sinon.default.spy());

            this.render(Ember.HTMLBars.template({
                "id": "OTgB+ovz",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-theme-table\",null,[[\"themes\",\"activateTheme\",\"downloadTheme\",\"deleteTheme\"],[[22,[\"themes\"]],[26,\"action\",[[21,0,[]],[22,[\"actionHandler\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"actionHandler\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"actionHandler\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            let packageNames = this.$('[data-test-theme-title]').map((i, name) => Ember.$(name).text().trim()).toArray();

            (0, _chai.expect)(packageNames, 'themes are ordered by label, folder names shown for duplicates').to.deep.equal(['Casper (another)', 'Casper (default)', 'Casper (mine)', 'Daring (daring)', 'Daring (daring-0.1.5)', 'foo']);
        });
    });
});
define('ghost-admin/tests/integration/components/gh-timezone-select-test', ['sinon', 'ember-test-helpers/wait', 'mocha', 'chai', 'ember-mocha'], function (_sinon, _wait, _mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: gh-timezone-select', function () {
        (0, _emberMocha.setupComponentTest)('gh-timezone-select', {
            integration: true
        });

        beforeEach(function () {
            this.set('availableTimezones', [{ name: 'Pacific/Pago_Pago', label: '(GMT -11:00) Midway Island, Samoa' }, { name: 'Etc/UTC', label: '(GMT) UTC' }, { name: 'Pacific/Kwajalein', label: '(GMT +12:00) International Date Line West' }]);
            this.set('activeTimezone', 'Etc/UTC');
        });

        (0, _mocha.it)('renders', function () {
            this.render(Ember.HTMLBars.template({
                "id": "owurbWEX",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-timezone-select\",null,[[\"availableTimezones\",\"activeTimezone\"],[[22,[\"availableTimezones\"]],[22,[\"activeTimezone\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _chai.expect)(this.$(), 'top-level elements').to.have.length(1);
            (0, _chai.expect)(this.$('option'), 'number of options').to.have.length(3);
            (0, _chai.expect)(this.$('select').val(), 'selected option value').to.equal('Etc/UTC');
        });

        (0, _mocha.it)('handles an unknown timezone', function () {
            this.set('activeTimezone', 'Europe/London');

            this.render(Ember.HTMLBars.template({
                "id": "owurbWEX",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-timezone-select\",null,[[\"availableTimezones\",\"activeTimezone\"],[[22,[\"availableTimezones\"]],[22,[\"activeTimezone\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            // we have an additional blank option at the top
            (0, _chai.expect)(this.$('option'), 'number of options').to.have.length(4);
            // blank option is selected
            (0, _chai.expect)(this.$('select').val(), 'selected option value').to.equal('');
            // we indicate the manual override
            (0, _chai.expect)(this.$('p').text()).to.match(/Your timezone has been automatically set to Europe\/London/);
        });

        (0, _mocha.it)('triggers update action on change', function (done) {
            let update = _sinon.default.spy();
            this.set('update', update);

            this.render(Ember.HTMLBars.template({
                "id": "Int1uZdt",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-timezone-select\",null,[[\"availableTimezones\",\"activeTimezone\",\"update\"],[[22,[\"availableTimezones\"]],[22,[\"activeTimezone\"]],[26,\"action\",[[21,0,[]],[22,[\"update\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            Ember.run(() => {
                this.$('select').val('Pacific/Pago_Pago').change();
            });

            (0, _wait.default)().then(() => {
                (0, _chai.expect)(update.calledOnce, 'update was called once').to.be.true;
                (0, _chai.expect)(update.firstCall.args[0].name, 'update was passed new timezone').to.equal('Pacific/Pago_Pago');
                done();
            });
        });

        // TODO: mock clock service, fake the time, test we have the correct
        // local time and it changes alongside selection changes
        (0, _mocha.it)('renders local time');
    });
});
define('ghost-admin/tests/integration/components/gh-trim-focus-input-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: gh-trim-focus-input', function () {
        (0, _emberMocha.setupComponentTest)('gh-trim-focus-input', {
            integration: true
        });

        (0, _mocha.it)('trims value on focusOut', function () {
            this.set('text', 'some random stuff    ');
            this.render(Ember.HTMLBars.template({
                "id": "/KW43yt7",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-trim-focus-input\",null,[[\"value\",\"input\"],[[26,\"readonly\",[[22,[\"text\"]]],null],[26,\"action\",[[21,0,[]],[26,\"mut\",[[22,[\"text\"]]],null]],[[\"value\"],[\"target.value\"]]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            Ember.run(() => {
                this.$('.gh-input').trigger('focusout');
            });

            (0, _chai.expect)(this.get('text')).to.equal('some random stuff');
        });

        (0, _mocha.it)('trims value on focusOut before calling custom focus-out', function () {
            this.set('text', 'some random stuff    ');
            this.set('customFocusOut', function (value) {
                (0, _chai.expect)(this.$('.gh-input').val(), 'input value').to.equal('some random stuff');
                (0, _chai.expect)(value, 'value').to.equal('some random stuff');
            });

            this.render(Ember.HTMLBars.template({
                "id": "kBMVGHYZ",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-trim-focus-input\",null,[[\"value\",\"input\",\"focus-out\"],[[26,\"readonly\",[[22,[\"text\"]]],null],[26,\"action\",[[21,0,[]],[26,\"mut\",[[22,[\"text\"]]],null]],[[\"value\"],[\"target.value\"]]],[26,\"action\",[[21,0,[]],[22,[\"customFocusOut\"]]],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            Ember.run(() => {
                this.$('.gh-input').trigger('focusout');
            });

            (0, _chai.expect)(this.get('text')).to.equal('some random stuff');
        });

        (0, _mocha.it)('does not have the autofocus attribute if not set to focus', function () {
            this.set('text', 'some text');
            this.render(Ember.HTMLBars.template({
                "id": "ijlCnd+e",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-trim-focus-input\",null,[[\"value\",\"shouldFocus\"],[[26,\"readonly\",[[22,[\"text\"]]],null],false]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$('.gh-input').attr('autofocus')).to.not.be.ok;
        });

        (0, _mocha.it)('has the autofocus attribute if set to focus', function () {
            this.set('text', 'some text');
            this.render(Ember.HTMLBars.template({
                "id": "gn/dpFm8",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-trim-focus-input\",null,[[\"value\",\"shouldFocus\"],[[26,\"readonly\",[[22,[\"text\"]]],null],true]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$('.gh-input').attr('autofocus')).to.be.ok;
        });

        (0, _mocha.it)('handles undefined values', function () {
            this.set('text', undefined);
            this.render(Ember.HTMLBars.template({
                "id": "gn/dpFm8",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-trim-focus-input\",null,[[\"value\",\"shouldFocus\"],[[26,\"readonly\",[[22,[\"text\"]]],null],true]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$('.gh-input').attr('autofocus')).to.be.ok;
        });

        (0, _mocha.it)('handles non-string values', function () {
            this.set('text', 10);
            this.render(Ember.HTMLBars.template({
                "id": "gn/dpFm8",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-trim-focus-input\",null,[[\"value\",\"shouldFocus\"],[[26,\"readonly\",[[22,[\"text\"]]],null],true]]],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$('.gh-input').val()).to.equal('10');
        });
    });
});
define('ghost-admin/tests/integration/components/gh-unsplash-photo-test', ['mocha', 'chai', 'ember-native-dom-helpers', 'ember-mocha'], function (_mocha, _chai, _emberNativeDomHelpers, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: gh-unsplash-photo', function () {
        (0, _emberMocha.setupComponentTest)('gh-unsplash-photo', {
            integration: true
        });

        beforeEach(function () {
            // NOTE: images.unsplash.com replaced with example.com to ensure we aren't
            // loading lots of images during tests and we get an immediate 404
            this.set('photo', {
                id: 'OYFHT4X5isg',
                created_at: '2017-08-09T00:20:42-04:00',
                updated_at: '2017-08-11T08:27:42-04:00',
                width: 5184,
                height: 3456,
                color: '#A8A99B',
                likes: 58,
                liked_by_user: false,
                description: null,
                user: {
                    id: 'cEpP9pR9Q7E',
                    updated_at: '2017-08-11T08:27:42-04:00',
                    username: 'danotis',
                    name: 'Dan Otis',
                    first_name: 'Dan',
                    last_name: 'Otis',
                    twitter_username: 'danotis',
                    portfolio_url: 'http://dan.exposure.co',
                    bio: 'Senior Visual Designer at Huge ',
                    location: 'San Jose, CA',
                    total_likes: 0,
                    total_photos: 8,
                    total_collections: 0,
                    profile_image: {
                        small: 'https://example.com/profile-fb-1502251227-8fe7a0522137.jpg?ixlib=rb-0.3.5&q=80&fm=jpg&crop=faces&cs=tinysrgb&fit=crop&h=32&w=32&s=37f67120fc464d7d920ff23c84963b38',
                        medium: 'https://example.com/profile-fb-1502251227-8fe7a0522137.jpg?ixlib=rb-0.3.5&q=80&fm=jpg&crop=faces&cs=tinysrgb&fit=crop&h=64&w=64&s=0a4f8a583caec826ac6b1ca80161fa43',
                        large: 'https://example.com/profile-fb-1502251227-8fe7a0522137.jpg?ixlib=rb-0.3.5&q=80&fm=jpg&crop=faces&cs=tinysrgb&fit=crop&h=128&w=128&s=b3aa4206e5d87f3eaa7bbe9180ebcd2b'
                    },
                    links: {
                        self: 'https://api.unsplash.com/users/danotis',
                        html: 'https://unsplash.com/@danotis',
                        photos: 'https://api.unsplash.com/users/danotis/photos',
                        likes: 'https://api.unsplash.com/users/danotis/likes',
                        portfolio: 'https://api.unsplash.com/users/danotis/portfolio',
                        following: 'https://api.unsplash.com/users/danotis/following',
                        followers: 'https://api.unsplash.com/users/danotis/followers'
                    }
                },
                current_user_collections: [],
                urls: {
                    raw: 'https://example.com/photo-1502252430442-aac78f397426',
                    full: 'https://example.com/photo-1502252430442-aac78f397426?ixlib=rb-0.3.5&q=85&fm=jpg&crop=entropy&cs=srgb&s=20f86c2f7bbb019122498a45d8260ee9',
                    regular: 'https://example.com/photo-1502252430442-aac78f397426?ixlib=rb-0.3.5&q=80&fm=jpg&crop=entropy&cs=tinysrgb&w=1080&fit=max&s=181760db8b7a61fa60a35277d7eb434e',
                    small: 'https://example.com/photo-1502252430442-aac78f397426?ixlib=rb-0.3.5&q=80&fm=jpg&crop=entropy&cs=tinysrgb&w=400&fit=max&s=1e2265597b59e874a1a002b4c3fd961c',
                    thumb: 'https://example.com/photo-1502252430442-aac78f397426?ixlib=rb-0.3.5&q=80&fm=jpg&crop=entropy&cs=tinysrgb&w=200&fit=max&s=57c86b0692bea92a282b9ab0dbfdacf4'
                },
                categories: [],
                links: {
                    self: 'https://api.unsplash.com/photos/OYFHT4X5isg',
                    html: 'https://unsplash.com/photos/OYFHT4X5isg',
                    download: 'https://unsplash.com/photos/OYFHT4X5isg/download',
                    download_location: 'https://api.unsplash.com/photos/OYFHT4X5isg/download'
                },
                ratio: 0.6666666666666666
            });
        });

        (0, _mocha.it)('sets background-color style', function () {
            this.render(Ember.HTMLBars.template({
                "id": "twOGZYPA",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-unsplash-photo\",null,[[\"photo\"],[[22,[\"photo\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _chai.expect)((0, _emberNativeDomHelpers.find)('[data-test-unsplash-photo-container]').attributes.style.value).to.have.string('background-color: #A8A99B');
        });

        (0, _mocha.it)('sets padding-bottom style', function () {
            this.render(Ember.HTMLBars.template({
                "id": "twOGZYPA",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-unsplash-photo\",null,[[\"photo\"],[[22,[\"photo\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            // don't check full padding-bottom value as it will likely vary across
            // browsers
            (0, _chai.expect)((0, _emberNativeDomHelpers.find)('[data-test-unsplash-photo-container]').attributes.style.value).to.have.string('padding-bottom: 66.66');
        });

        (0, _mocha.it)('uses correct image size url', function () {
            this.render(Ember.HTMLBars.template({
                "id": "twOGZYPA",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-unsplash-photo\",null,[[\"photo\"],[[22,[\"photo\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _chai.expect)((0, _emberNativeDomHelpers.find)('[data-test-unsplash-photo-image]').attributes.src.value).to.have.string('&w=1200');
        });

        (0, _mocha.it)('calculates image width/height', function () {
            this.render(Ember.HTMLBars.template({
                "id": "twOGZYPA",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"gh-unsplash-photo\",null,[[\"photo\"],[[22,[\"photo\"]]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _chai.expect)((0, _emberNativeDomHelpers.find)('[data-test-unsplash-photo-image]').attributes.width.value).to.equal('1200');

            (0, _chai.expect)((0, _emberNativeDomHelpers.find)('[data-test-unsplash-photo-image]').attributes.height.value).to.equal('800');
        });

        (0, _mocha.it)('triggers insert action');
        (0, _mocha.it)('triggers zoom action');

        (0, _mocha.describe)('zoomed', function () {
            (0, _mocha.it)('omits padding-bottom style');
            (0, _mocha.it)('triggers insert action');
            (0, _mocha.it)('triggers zoom action');
        });
    });
});
define('ghost-admin/tests/integration/components/gh-unsplash-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: gh-unsplash', function () {
        (0, _emberMocha.setupComponentTest)('gh-unsplash', {
            integration: true
        });

        (0, _mocha.it)('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#gh-unsplash}}
            //     template content
            //   {{/gh-unsplash}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "NCS7F0pZ",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"gh-unsplash\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });

        (0, _mocha.it)('loads new photos by default');
        (0, _mocha.it)('has responsive columns');
        (0, _mocha.it)('can zoom');
        (0, _mocha.it)('can close zoom by clicking on image');
        (0, _mocha.it)('can close zoom by clicking outside image');
        (0, _mocha.it)('triggers insert action');
        (0, _mocha.it)('handles errors');

        (0, _mocha.describe)('searching', function () {
            (0, _mocha.it)('works');
            (0, _mocha.it)('handles no results');
            (0, _mocha.it)('handles error');
        });

        (0, _mocha.describe)('closing', function () {
            (0, _mocha.it)('triggers close action');
            (0, _mocha.it)('can be triggerd by escape key');
            (0, _mocha.it)('cannot be triggered by escape key when zoomed');
        });
    });
});
define('ghost-admin/tests/integration/components/gh-uploader-test', ['pretender', 'sinon', 'ember-test-helpers/wait', 'ember-native-dom-helpers', 'ghost-admin/tests/helpers/file-upload', 'mocha', 'chai', 'ember-mocha'], function (_pretender, _sinon, _wait, _emberNativeDomHelpers, _fileUpload, _mocha, _chai, _emberMocha) {
    'use strict';

    var _slicedToArray = function () {
        function sliceIterator(arr, i) {
            var _arr = [];
            var _n = true;
            var _d = false;
            var _e = undefined;

            try {
                for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
                    _arr.push(_s.value);

                    if (i && _arr.length === i) break;
                }
            } catch (err) {
                _d = true;
                _e = err;
            } finally {
                try {
                    if (!_n && _i["return"]) _i["return"]();
                } finally {
                    if (_d) throw _e;
                }
            }

            return _arr;
        }

        return function (arr, i) {
            if (Array.isArray(arr)) {
                return arr;
            } else if (Symbol.iterator in Object(arr)) {
                return sliceIterator(arr, i);
            } else {
                throw new TypeError("Invalid attempt to destructure non-iterable instance");
            }
        };
    }();

    const stubSuccessfulUpload = function stubSuccessfulUpload(server, delay = 0) {
        server.post('/ghost/api/v0.1/uploads/', function () {
            return [200, { 'Content-Type': 'application/json' }, '"/content/images/test.png"'];
        }, delay);
    };

    const stubFailedUpload = function stubFailedUpload(server, code, error, delay = 0) {
        server.post('/ghost/api/v0.1/uploads/', function () {
            return [code, { 'Content-Type': 'application/json' }, JSON.stringify({
                errors: [{
                    errorType: error,
                    message: `Error: ${error}`
                }]
            })];
        }, delay);
    };

    (0, _mocha.describe)('Integration: Component: gh-uploader', function () {
        (0, _emberMocha.setupComponentTest)('gh-uploader', {
            integration: true
        });

        let server;

        beforeEach(function () {
            server = new _pretender.default();
        });

        afterEach(function () {
            server.shutdown();
        });

        (0, _mocha.describe)('uploads', function () {
            beforeEach(function () {
                stubSuccessfulUpload(server);
            });

            (0, _mocha.it)('triggers uploads when `files` is set', async function () {
                this.render(Ember.HTMLBars.template({
                    "id": "gpMfe7AW",
                    "block": "{\"symbols\":[],\"statements\":[[4,\"gh-uploader\",null,[[\"files\"],[[22,[\"files\"]]]],{\"statements\":[],\"parameters\":[]},null]],\"hasEval\":false}",
                    "meta": {}
                }));

                this.set('files', [(0, _fileUpload.createFile)()]);
                await (0, _wait.default)();

                var _server$handledReques = _slicedToArray(server.handledRequests, 1);

                let lastRequest = _server$handledReques[0];

                (0, _chai.expect)(server.handledRequests.length).to.equal(1);
                (0, _chai.expect)(lastRequest.url).to.equal('/ghost/api/v0.1/uploads/');
                // requestBody is a FormData object
                // this will fail in anything other than Chrome and Firefox
                // https://developer.mozilla.org/en-US/docs/Web/API/FormData#Browser_compatibility
                (0, _chai.expect)(lastRequest.requestBody.has('uploadimage')).to.be.true;
            });

            (0, _mocha.it)('triggers multiple uploads', async function () {
                this.render(Ember.HTMLBars.template({
                    "id": "gpMfe7AW",
                    "block": "{\"symbols\":[],\"statements\":[[4,\"gh-uploader\",null,[[\"files\"],[[22,[\"files\"]]]],{\"statements\":[],\"parameters\":[]},null]],\"hasEval\":false}",
                    "meta": {}
                }));

                this.set('files', [(0, _fileUpload.createFile)(), (0, _fileUpload.createFile)()]);
                await (0, _wait.default)();

                (0, _chai.expect)(server.handledRequests.length).to.equal(2);
            });

            (0, _mocha.it)('triggers onStart when upload starts', async function () {
                this.set('uploadStarted', _sinon.default.spy());

                this.render(Ember.HTMLBars.template({
                    "id": "yiIXnLdf",
                    "block": "{\"symbols\":[],\"statements\":[[4,\"gh-uploader\",null,[[\"files\",\"onStart\"],[[22,[\"files\"]],[26,\"action\",[[21,0,[]],[22,[\"uploadStarted\"]]],null]]],{\"statements\":[],\"parameters\":[]},null]],\"hasEval\":false}",
                    "meta": {}
                }));
                this.set('files', [(0, _fileUpload.createFile)(), (0, _fileUpload.createFile)()]);
                await (0, _wait.default)();

                (0, _chai.expect)(this.get('uploadStarted').calledOnce).to.be.true;
            });

            (0, _mocha.it)('triggers onUploadSuccess when a file uploads', async function () {
                this.set('fileUploaded', _sinon.default.spy());

                this.render(Ember.HTMLBars.template({
                    "id": "6pIOQf9G",
                    "block": "{\"symbols\":[],\"statements\":[[4,\"gh-uploader\",null,[[\"files\",\"onUploadSuccess\"],[[22,[\"files\"]],[26,\"action\",[[21,0,[]],[22,[\"fileUploaded\"]]],null]]],{\"statements\":[],\"parameters\":[]},null]],\"hasEval\":false}",
                    "meta": {}
                }));
                this.set('files', [(0, _fileUpload.createFile)(['test'], { name: 'file1.png' }), (0, _fileUpload.createFile)()]);
                await (0, _wait.default)();

                // triggered for each file
                (0, _chai.expect)(this.get('fileUploaded').calledTwice).to.be.true;

                // filename and url is passed in arg
                let firstCall = this.get('fileUploaded').getCall(0);
                (0, _chai.expect)(firstCall.args[0].fileName).to.equal('file1.png');
                (0, _chai.expect)(firstCall.args[0].url).to.equal('/content/images/test.png');
            });

            (0, _mocha.it)('triggers onComplete when all files uploaded', async function () {
                this.set('uploadsFinished', _sinon.default.spy());

                this.render(Ember.HTMLBars.template({
                    "id": "Yy02jCeB",
                    "block": "{\"symbols\":[],\"statements\":[[4,\"gh-uploader\",null,[[\"files\",\"onComplete\"],[[22,[\"files\"]],[26,\"action\",[[21,0,[]],[22,[\"uploadsFinished\"]]],null]]],{\"statements\":[],\"parameters\":[]},null]],\"hasEval\":false}",
                    "meta": {}
                }));
                this.set('files', [(0, _fileUpload.createFile)(['test'], { name: 'file1.png' }), (0, _fileUpload.createFile)(['test'], { name: 'file2.png' })]);
                await (0, _wait.default)();

                (0, _chai.expect)(this.get('uploadsFinished').calledOnce).to.be.true;

                // array of filenames and urls is passed in arg

                var _get$getCall$args = _slicedToArray(this.get('uploadsFinished').getCall(0).args, 1);

                let result = _get$getCall$args[0];

                (0, _chai.expect)(result.length).to.equal(2);
                (0, _chai.expect)(result[0].fileName).to.equal('file1.png');
                (0, _chai.expect)(result[0].url).to.equal('/content/images/test.png');
                (0, _chai.expect)(result[1].fileName).to.equal('file2.png');
                (0, _chai.expect)(result[1].url).to.equal('/content/images/test.png');
            });

            (0, _mocha.it)('onComplete only passes results for last upload', async function () {
                this.set('uploadsFinished', _sinon.default.spy());

                this.render(Ember.HTMLBars.template({
                    "id": "Yy02jCeB",
                    "block": "{\"symbols\":[],\"statements\":[[4,\"gh-uploader\",null,[[\"files\",\"onComplete\"],[[22,[\"files\"]],[26,\"action\",[[21,0,[]],[22,[\"uploadsFinished\"]]],null]]],{\"statements\":[],\"parameters\":[]},null]],\"hasEval\":false}",
                    "meta": {}
                }));
                this.set('files', [(0, _fileUpload.createFile)(['test'], { name: 'file1.png' })]);
                await (0, _wait.default)();

                this.set('files', [(0, _fileUpload.createFile)(['test'], { name: 'file2.png' })]);

                await (0, _wait.default)();

                var _get$getCall$args2 = _slicedToArray(this.get('uploadsFinished').getCall(1).args, 1);

                let results = _get$getCall$args2[0];

                (0, _chai.expect)(results.length).to.equal(1);
                (0, _chai.expect)(results[0].fileName).to.equal('file2.png');
            });

            (0, _mocha.it)('onComplete returns results in same order as selected', async function () {
                // first request has a delay to simulate larger file
                server.post('/ghost/api/v0.1/uploads/', function () {
                    // second request has no delay to simulate small file
                    stubSuccessfulUpload(server, 0);

                    return [200, { 'Content-Type': 'application/json' }, '"/content/images/test.png"'];
                }, 100);

                this.set('uploadsFinished', _sinon.default.spy());

                this.render(Ember.HTMLBars.template({
                    "id": "Yy02jCeB",
                    "block": "{\"symbols\":[],\"statements\":[[4,\"gh-uploader\",null,[[\"files\",\"onComplete\"],[[22,[\"files\"]],[26,\"action\",[[21,0,[]],[22,[\"uploadsFinished\"]]],null]]],{\"statements\":[],\"parameters\":[]},null]],\"hasEval\":false}",
                    "meta": {}
                }));
                this.set('files', [(0, _fileUpload.createFile)(['test'], { name: 'file1.png' }), // large - finishes last
                (0, _fileUpload.createFile)(['test'], { name: 'file2.png' }) // small - finishes first
                ]);
                await (0, _wait.default)();

                var _get$getCall$args3 = _slicedToArray(this.get('uploadsFinished').getCall(0).args, 1);

                let results = _get$getCall$args3[0];

                (0, _chai.expect)(results.length).to.equal(2);
                (0, _chai.expect)(results[0].fileName).to.equal('file1.png');
            });

            (0, _mocha.it)('doesn\'t allow new files to be set whilst uploading', async function () {
                let errorSpy = _sinon.default.spy(console, 'error');
                stubSuccessfulUpload(server, 100);

                this.render(Ember.HTMLBars.template({
                    "id": "gpMfe7AW",
                    "block": "{\"symbols\":[],\"statements\":[[4,\"gh-uploader\",null,[[\"files\"],[[22,[\"files\"]]]],{\"statements\":[],\"parameters\":[]},null]],\"hasEval\":false}",
                    "meta": {}
                }));
                this.set('files', [(0, _fileUpload.createFile)()]);

                // logs error because upload is in progress
                Ember.run.later(() => {
                    this.set('files', [(0, _fileUpload.createFile)()]);
                }, 50);

                // runs ok because original upload has finished
                Ember.run.later(() => {
                    this.set('files', [(0, _fileUpload.createFile)()]);
                }, 200);

                await (0, _wait.default)();

                (0, _chai.expect)(server.handledRequests.length).to.equal(2);
                (0, _chai.expect)(errorSpy.calledOnce).to.be.true;
                errorSpy.restore();
            });

            (0, _mocha.it)('yields isUploading whilst upload is in progress', async function () {
                stubSuccessfulUpload(server, 200);

                this.render(Ember.HTMLBars.template({
                    "id": "9LkwxoyH",
                    "block": "{\"symbols\":[\"uploader\"],\"statements\":[[0,\"\\n\"],[4,\"gh-uploader\",null,[[\"files\"],[[22,[\"files\"]]]],{\"statements\":[[4,\"if\",[[21,1,[\"isUploading\"]]],null,{\"statements\":[[0,\"                    \"],[6,\"div\"],[10,\"class\",\"is-uploading-test\"],[8],[9],[0,\"\\n\"]],\"parameters\":[]},null]],\"parameters\":[1]},null]],\"hasEval\":false}",
                    "meta": {}
                }));

                this.set('files', [(0, _fileUpload.createFile)(), (0, _fileUpload.createFile)()]);

                Ember.run.later(() => {
                    (0, _chai.expect)((0, _emberNativeDomHelpers.find)('.is-uploading-test')).to.exist;
                }, 100);

                await (0, _wait.default)();

                (0, _chai.expect)((0, _emberNativeDomHelpers.find)('.is-uploading-test')).to.not.exist;
            });

            (0, _mocha.it)('yields progressBar component with total upload progress', async function () {
                stubSuccessfulUpload(server, 200);

                this.render(Ember.HTMLBars.template({
                    "id": "nQFBujsf",
                    "block": "{\"symbols\":[\"uploader\"],\"statements\":[[0,\"\\n\"],[4,\"gh-uploader\",null,[[\"files\"],[[22,[\"files\"]]]],{\"statements\":[[0,\"                \"],[1,[21,1,[\"progressBar\"]],false],[0,\"\\n\"]],\"parameters\":[1]},null]],\"hasEval\":false}",
                    "meta": {}
                }));

                this.set('files', [(0, _fileUpload.createFile)(), (0, _fileUpload.createFile)()]);

                Ember.run.later(() => {
                    (0, _chai.expect)((0, _emberNativeDomHelpers.find)('[data-test-progress-bar]')).to.exist;
                    let progressWidth = parseInt((0, _emberNativeDomHelpers.find)('[data-test-progress-bar]').style.width);
                    (0, _chai.expect)(progressWidth).to.be.above(0);
                    (0, _chai.expect)(progressWidth).to.be.below(100);
                }, 100);

                await (0, _wait.default)();

                let progressWidth = parseInt((0, _emberNativeDomHelpers.find)('[data-test-progress-bar]').style.width);
                (0, _chai.expect)(progressWidth).to.equal(100);
            });

            (0, _mocha.it)('yields files property', function () {
                this.render(Ember.HTMLBars.template({
                    "id": "pVuxQ0Gb",
                    "block": "{\"symbols\":[\"uploader\",\"file\"],\"statements\":[[0,\"\\n\"],[4,\"gh-uploader\",null,[[\"files\"],[[22,[\"files\"]]]],{\"statements\":[[4,\"each\",[[21,1,[\"files\"]]],null,{\"statements\":[[0,\"                    \"],[6,\"div\"],[10,\"class\",\"file\"],[8],[1,[21,2,[\"name\"]],false],[9],[0,\"\\n\"]],\"parameters\":[2]},null]],\"parameters\":[1]},null]],\"hasEval\":false}",
                    "meta": {}
                }));

                this.set('files', [(0, _fileUpload.createFile)(['test'], { name: 'file1.png' }), (0, _fileUpload.createFile)(['test'], { name: 'file2.png' })]);

                (0, _chai.expect)((0, _emberNativeDomHelpers.findAll)('.file')[0].textContent).to.equal('file1.png');
                (0, _chai.expect)((0, _emberNativeDomHelpers.findAll)('.file')[1].textContent).to.equal('file2.png');
            });

            (0, _mocha.it)('can be cancelled', async function () {
                stubSuccessfulUpload(server, 200);
                this.set('cancelled', _sinon.default.spy());
                this.set('complete', _sinon.default.spy());

                this.render(Ember.HTMLBars.template({
                    "id": "HFDa95DQ",
                    "block": "{\"symbols\":[\"uploader\"],\"statements\":[[0,\"\\n\"],[4,\"gh-uploader\",null,[[\"files\",\"onCancel\"],[[22,[\"files\"]],[26,\"action\",[[21,0,[]],[22,[\"cancelled\"]]],null]]],{\"statements\":[[0,\"                \"],[6,\"button\"],[10,\"class\",\"cancel-button\"],[3,\"action\",[[21,0,[]],[21,1,[\"cancel\"]]]],[8],[0,\"Cancel\"],[9],[0,\"\\n\"]],\"parameters\":[1]},null]],\"hasEval\":false}",
                    "meta": {}
                }));

                this.set('files', [(0, _fileUpload.createFile)()]);

                Ember.run.later(() => {
                    (0, _emberNativeDomHelpers.click)('.cancel-button');
                }, 50);

                await (0, _wait.default)();

                (0, _chai.expect)(this.get('cancelled').calledOnce, 'onCancel triggered').to.be.true;
                (0, _chai.expect)(this.get('complete').notCalled, 'onComplete triggered').to.be.true;
            });

            (0, _mocha.it)('uploads to supplied `uploadUrl`', async function () {
                server.post('/ghost/api/v0.1/images/', function () {
                    return [200, { 'Content-Type': 'application/json' }, '"/content/images/test.png"'];
                });

                this.render(Ember.HTMLBars.template({
                    "id": "uqLU6ItZ",
                    "block": "{\"symbols\":[],\"statements\":[[4,\"gh-uploader\",null,[[\"files\",\"uploadUrl\"],[[22,[\"files\"]],\"/images/\"]],{\"statements\":[],\"parameters\":[]},null]],\"hasEval\":false}",
                    "meta": {}
                }));
                this.set('files', [(0, _fileUpload.createFile)()]);
                await (0, _wait.default)();

                var _server$handledReques2 = _slicedToArray(server.handledRequests, 1);

                let lastRequest = _server$handledReques2[0];

                (0, _chai.expect)(lastRequest.url).to.equal('/ghost/api/v0.1/images/');
            });

            (0, _mocha.it)('passes supplied paramName in request', async function () {
                this.render(Ember.HTMLBars.template({
                    "id": "tj0GM6a9",
                    "block": "{\"symbols\":[],\"statements\":[[4,\"gh-uploader\",null,[[\"files\",\"paramName\"],[[22,[\"files\"]],\"testupload\"]],{\"statements\":[],\"parameters\":[]},null]],\"hasEval\":false}",
                    "meta": {}
                }));
                this.set('files', [(0, _fileUpload.createFile)()]);
                await (0, _wait.default)();

                var _server$handledReques3 = _slicedToArray(server.handledRequests, 1);

                let lastRequest = _server$handledReques3[0];

                // requestBody is a FormData object
                // this will fail in anything other than Chrome and Firefox
                // https://developer.mozilla.org/en-US/docs/Web/API/FormData#Browser_compatibility
                (0, _chai.expect)(lastRequest.requestBody.has('testupload')).to.be.true;
            });
        });

        (0, _mocha.describe)('validation', function () {
            (0, _mocha.it)('validates file extensions by default', async function () {
                this.set('onFailed', _sinon.default.spy());

                this.render(Ember.HTMLBars.template({
                    "id": "XQmLTqoZ",
                    "block": "{\"symbols\":[],\"statements\":[[0,\"\\n                \"],[4,\"gh-uploader\",null,[[\"files\",\"extensions\",\"onFailed\"],[[22,[\"files\"]],\"jpg,jpeg\",[26,\"action\",[[21,0,[]],[22,[\"onFailed\"]]],null]]],{\"statements\":[],\"parameters\":[]},null],[0,\"\\n            \"]],\"hasEval\":false}",
                    "meta": {}
                }));
                this.set('files', [(0, _fileUpload.createFile)(['test'], { name: 'test.png' })]);
                await (0, _wait.default)();

                var _get$firstCall$args = _slicedToArray(this.get('onFailed').firstCall.args, 1);

                let onFailedResult = _get$firstCall$args[0];

                (0, _chai.expect)(onFailedResult.length).to.equal(1);
                (0, _chai.expect)(onFailedResult[0].fileName, 'onFailed file name').to.equal('test.png');
                (0, _chai.expect)(onFailedResult[0].message, 'onFailed message').to.match(/not supported/);
            });

            (0, _mocha.it)('accepts custom validation method', async function () {
                this.set('validate', function (file) {
                    return `${file.name} failed test validation`;
                });
                this.set('onFailed', _sinon.default.spy());

                this.render(Ember.HTMLBars.template({
                    "id": "xXpasooN",
                    "block": "{\"symbols\":[],\"statements\":[[0,\"\\n                \"],[4,\"gh-uploader\",null,[[\"files\",\"validate\",\"onFailed\"],[[22,[\"files\"]],[26,\"action\",[[21,0,[]],[22,[\"validate\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"onFailed\"]]],null]]],{\"statements\":[],\"parameters\":[]},null],[0,\"\\n            \"]],\"hasEval\":false}",
                    "meta": {}
                }));
                this.set('files', [(0, _fileUpload.createFile)(['test'], { name: 'test.png' })]);
                await (0, _wait.default)();

                var _get$firstCall$args2 = _slicedToArray(this.get('onFailed').firstCall.args, 1);

                let onFailedResult = _get$firstCall$args2[0];

                (0, _chai.expect)(onFailedResult.length).to.equal(1);
                (0, _chai.expect)(onFailedResult[0].fileName).to.equal('test.png');
                (0, _chai.expect)(onFailedResult[0].message).to.equal('test.png failed test validation');
            });

            (0, _mocha.it)('yields errors when validation fails', async function () {
                this.render(Ember.HTMLBars.template({
                    "id": "WDJQ6QDJ",
                    "block": "{\"symbols\":[\"uploader\",\"error\"],\"statements\":[[0,\"\\n\"],[4,\"gh-uploader\",null,[[\"files\",\"extensions\"],[[22,[\"files\"]],\"jpg,jpeg\"]],{\"statements\":[[4,\"each\",[[21,1,[\"errors\"]]],null,{\"statements\":[[0,\"                        \"],[6,\"div\"],[10,\"class\",\"error-fileName\"],[8],[1,[21,2,[\"fileName\"]],false],[9],[0,\"\\n                        \"],[6,\"div\"],[10,\"class\",\"error-message\"],[8],[1,[21,2,[\"message\"]],false],[9],[0,\"\\n\"]],\"parameters\":[2]},null]],\"parameters\":[1]},null],[0,\"            \"]],\"hasEval\":false}",
                    "meta": {}
                }));
                this.set('files', [(0, _fileUpload.createFile)(['test'], { name: 'test.png' })]);
                await (0, _wait.default)();

                (0, _chai.expect)((0, _emberNativeDomHelpers.find)('.error-fileName').textContent).to.equal('test.png');
                (0, _chai.expect)((0, _emberNativeDomHelpers.find)('.error-message').textContent).to.match(/not supported/);
            });
        });

        (0, _mocha.describe)('server errors', function () {
            beforeEach(function () {
                stubFailedUpload(server, 500, 'No upload for you');
            });

            (0, _mocha.it)('triggers onFailed when uploads complete', async function () {
                this.set('uploadFailed', _sinon.default.spy());
                this.set('uploadComplete', _sinon.default.spy());

                this.render(Ember.HTMLBars.template({
                    "id": "Tj2ZdeLq",
                    "block": "{\"symbols\":[],\"statements\":[[0,\"\\n\"],[4,\"gh-uploader\",null,[[\"files\",\"onFailed\",\"onComplete\"],[[22,[\"files\"]],[26,\"action\",[[21,0,[]],[22,[\"uploadFailed\"]]],null],[26,\"action\",[[21,0,[]],[22,[\"uploadComplete\"]]],null]]],{\"statements\":[],\"parameters\":[]},null],[0,\"            \"]],\"hasEval\":false}",
                    "meta": {}
                }));
                this.set('files', [(0, _fileUpload.createFile)(['test'], { name: 'file1.png' }), (0, _fileUpload.createFile)(['test'], { name: 'file2.png' })]);
                await (0, _wait.default)();

                (0, _chai.expect)(this.get('uploadFailed').calledOnce).to.be.true;
                (0, _chai.expect)(this.get('uploadComplete').calledOnce).to.be.true;

                var _get$firstCall$args3 = _slicedToArray(this.get('uploadFailed').firstCall.args, 1);

                let failures = _get$firstCall$args3[0];

                (0, _chai.expect)(failures.length).to.equal(2);
                (0, _chai.expect)(failures[0].fileName).to.equal('file1.png');
                (0, _chai.expect)(failures[0].message).to.equal('Error: No upload for you');
            });

            (0, _mocha.it)('triggers onUploadFailure when each upload fails', async function () {
                this.set('uploadFail', _sinon.default.spy());

                this.render(Ember.HTMLBars.template({
                    "id": "Wj+iI1pp",
                    "block": "{\"symbols\":[],\"statements\":[[0,\"\\n\"],[4,\"gh-uploader\",null,[[\"files\",\"onUploadFailure\"],[[22,[\"files\"]],[26,\"action\",[[21,0,[]],[22,[\"uploadFail\"]]],null]]],{\"statements\":[],\"parameters\":[]},null],[0,\"            \"]],\"hasEval\":false}",
                    "meta": {}
                }));
                this.set('files', [(0, _fileUpload.createFile)(['test'], { name: 'file1.png' }), (0, _fileUpload.createFile)(['test'], { name: 'file2.png' })]);
                await (0, _wait.default)();

                (0, _chai.expect)(this.get('uploadFail').calledTwice).to.be.true;

                var _get$firstCall$args4 = _slicedToArray(this.get('uploadFail').firstCall.args, 1);

                let firstFailure = _get$firstCall$args4[0];

                (0, _chai.expect)(firstFailure.fileName).to.equal('file1.png');
                (0, _chai.expect)(firstFailure.message).to.equal('Error: No upload for you');

                var _get$secondCall$args = _slicedToArray(this.get('uploadFail').secondCall.args, 1);

                let secondFailure = _get$secondCall$args[0];

                (0, _chai.expect)(secondFailure.fileName).to.equal('file2.png');
                (0, _chai.expect)(secondFailure.message).to.equal('Error: No upload for you');
            });

            (0, _mocha.it)('yields errors when uploads fail', async function () {
                this.render(Ember.HTMLBars.template({
                    "id": "vr+MI9jM",
                    "block": "{\"symbols\":[\"uploader\",\"error\"],\"statements\":[[0,\"\\n\"],[4,\"gh-uploader\",null,[[\"files\"],[[22,[\"files\"]]]],{\"statements\":[[4,\"each\",[[21,1,[\"errors\"]]],null,{\"statements\":[[0,\"                        \"],[6,\"div\"],[10,\"class\",\"error-fileName\"],[8],[1,[21,2,[\"fileName\"]],false],[9],[0,\"\\n                        \"],[6,\"div\"],[10,\"class\",\"error-message\"],[8],[1,[21,2,[\"message\"]],false],[9],[0,\"\\n\"]],\"parameters\":[2]},null]],\"parameters\":[1]},null],[0,\"            \"]],\"hasEval\":false}",
                    "meta": {}
                }));
                this.set('files', [(0, _fileUpload.createFile)(['test'], { name: 'test.png' })]);
                await (0, _wait.default)();

                (0, _chai.expect)((0, _emberNativeDomHelpers.find)('.error-fileName').textContent).to.equal('test.png');
                (0, _chai.expect)((0, _emberNativeDomHelpers.find)('.error-message').textContent).to.equal('Error: No upload for you');
            });
        });
    });
});
define('ghost-admin/tests/integration/components/gh-validation-status-container-test', ['ember-data', 'ember-test-helpers/wait', 'mocha', 'chai', 'ember-mocha'], function (_emberData, _wait, _mocha, _chai, _emberMocha) {
    'use strict';

    const Errors = _emberData.default.Errors;


    (0, _mocha.describe)('Integration: Component: gh-validation-status-container', function () {
        (0, _emberMocha.setupComponentTest)('gh-validation-status-container', {
            integration: true
        });

        beforeEach(function () {
            let testObject = Ember.Object.create();
            testObject.set('name', 'Test');
            testObject.set('hasValidated', []);
            testObject.set('errors', Errors.create());

            this.set('testObject', testObject);
        });

        (0, _mocha.it)('has no success/error class by default', function () {
            this.render(Ember.HTMLBars.template({
                "id": "11iTlQuZ",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n\"],[4,\"gh-validation-status-container\",null,[[\"class\",\"property\",\"errors\",\"hasValidated\"],[\"gh-test\",\"name\",[22,[\"testObject\",\"errors\"]],[22,[\"testObject\",\"hasValidated\"]]]],{\"statements\":[],\"parameters\":[]},null],[0,\"        \"]],\"hasEval\":false}",
                "meta": {}
            }));

            return (0, _wait.default)().then(() => {
                (0, _chai.expect)(this.$('.gh-test')).to.have.length(1);
                (0, _chai.expect)(this.$('.gh-test').hasClass('success')).to.be.false;
                (0, _chai.expect)(this.$('.gh-test').hasClass('error')).to.be.false;
            });
        });

        (0, _mocha.it)('has success class when valid', function () {
            this.get('testObject.hasValidated').push('name');

            this.render(Ember.HTMLBars.template({
                "id": "11iTlQuZ",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n\"],[4,\"gh-validation-status-container\",null,[[\"class\",\"property\",\"errors\",\"hasValidated\"],[\"gh-test\",\"name\",[22,[\"testObject\",\"errors\"]],[22,[\"testObject\",\"hasValidated\"]]]],{\"statements\":[],\"parameters\":[]},null],[0,\"        \"]],\"hasEval\":false}",
                "meta": {}
            }));

            return (0, _wait.default)().then(() => {
                (0, _chai.expect)(this.$('.gh-test')).to.have.length(1);
                (0, _chai.expect)(this.$('.gh-test').hasClass('success')).to.be.true;
                (0, _chai.expect)(this.$('.gh-test').hasClass('error')).to.be.false;
            });
        });

        (0, _mocha.it)('has error class when invalid', function () {
            this.get('testObject.hasValidated').push('name');
            this.get('testObject.errors').add('name', 'has error');

            this.render(Ember.HTMLBars.template({
                "id": "11iTlQuZ",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n\"],[4,\"gh-validation-status-container\",null,[[\"class\",\"property\",\"errors\",\"hasValidated\"],[\"gh-test\",\"name\",[22,[\"testObject\",\"errors\"]],[22,[\"testObject\",\"hasValidated\"]]]],{\"statements\":[],\"parameters\":[]},null],[0,\"        \"]],\"hasEval\":false}",
                "meta": {}
            }));

            return (0, _wait.default)().then(() => {
                (0, _chai.expect)(this.$('.gh-test')).to.have.length(1);
                (0, _chai.expect)(this.$('.gh-test').hasClass('success')).to.be.false;
                (0, _chai.expect)(this.$('.gh-test').hasClass('error')).to.be.true;
            });
        });

        (0, _mocha.it)('still renders if hasValidated is undefined', function () {
            this.set('testObject.hasValidated', undefined);

            this.render(Ember.HTMLBars.template({
                "id": "11iTlQuZ",
                "block": "{\"symbols\":[],\"statements\":[[0,\"\\n\"],[4,\"gh-validation-status-container\",null,[[\"class\",\"property\",\"errors\",\"hasValidated\"],[\"gh-test\",\"name\",[22,[\"testObject\",\"errors\"]],[22,[\"testObject\",\"hasValidated\"]]]],{\"statements\":[],\"parameters\":[]},null],[0,\"        \"]],\"hasEval\":false}",
                "meta": {}
            }));

            return (0, _wait.default)().then(() => {
                (0, _chai.expect)(this.$('.gh-test')).to.have.length(1);
            });
        });
    });
});
define('ghost-admin/tests/integration/components/koenig-basic-html-input-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: koenig-basic-html-input', function () {
        (0, _emberMocha.setupComponentTest)('koenig-basic-html-input', {
            integration: true
        });

        _mocha.it.skip('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#koenig-basic-html-input}}
            //     template content
            //   {{/koenig-basic-html-input}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "3iirzDLr",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"koenig-basic-html-input\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/koenig-caption-input-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: koenig-caption-input', function () {
        (0, _emberMocha.setupComponentTest)('koenig-caption-input', {
            integration: true
        });

        _mocha.it.skip('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#koenig-caption-input}}
            //     template content
            //   {{/koenig-caption-input}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "q/3pp7Gz",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"koenig-caption-input\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/koenig-card-embed-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: koenig-card-embed', function () {
        (0, _emberMocha.setupComponentTest)('koenig-card-embed', {
            integration: true
        });

        _mocha.it.skip('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#koenig-card-embed}}
            //     template content
            //   {{/koenig-card-embed}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "wrvvkvj5",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"koenig-card-embed\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/koenig-card-gallery-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: koenig-card-gallery', function () {
        (0, _emberMocha.setupComponentTest)('koenig-card-gallery', {
            integration: true
        });

        _mocha.it.skip('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#koenig-card-gallery}}
            //     template content
            //   {{/koenig-card-gallery}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "oRfParQl",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"koenig-card-gallery\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/koenig-card-html-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: koenig-card-html', function () {
        (0, _emberMocha.setupComponentTest)('koenig-card-html', {
            integration: true
        });

        _mocha.it.skip('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#koenig-card-html}}
            //     template content
            //   {{/koenig-card-html}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "SS3DB2q/",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"koenig-card-html\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/koenig-card-image-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: koenig-card-image', function () {
        (0, _emberMocha.setupComponentTest)('koenig-card-image', {
            integration: true
        });

        (0, _mocha.it)('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#koenig-card-image}}
            //     template content
            //   {{/koenig-card-image}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "q8HciHHn",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"koenig-card-image\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/koenig-card-markdown-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: koenig-card-markdown', function () {
        (0, _emberMocha.setupComponentTest)('koenig-card-markdown', {
            integration: true
        });

        _mocha.it.skip('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#koenig-card-markdown}}
            //     template content
            //   {{/koenig-card-markdown}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "CT5dejwH",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"koenig-card-markdown\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/koenig-editor-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: koenig-editor', function () {
        (0, _emberMocha.setupComponentTest)('koenig-editor', {
            integration: true
        });

        (0, _mocha.it)('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#koenig-editor}}
            //     template content
            //   {{/koenig-editor}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "fZ3gwcSG",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"koenig-editor\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/koenig-link-input-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: koenig-link-input', function () {
        (0, _emberMocha.setupComponentTest)('koenig-link-input', {
            integration: true
        });

        _mocha.it.skip('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#koenig-link-input}}
            //     template content
            //   {{/koenig-link-input}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "wO6ztiwW",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"koenig-link-input\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/koenig-link-toolbar-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: koenig-link-toolbar', function () {
        (0, _emberMocha.setupComponentTest)('koenig-link-toolbar', {
            integration: true
        });

        _mocha.it.skip('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#koenig-link-toolbar}}
            //     template content
            //   {{/koenig-link-toolbar}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "+pEbF7i4",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"koenig-link-toolbar\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/koenig-plus-menu-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: koenig-plus-menu', function () {
        (0, _emberMocha.setupComponentTest)('koenig-plus-menu', {
            integration: true
        });

        (0, _mocha.it)('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#koenig-plus-menu}}
            //     template content
            //   {{/koenig-plus-menu}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "WzUErdRF",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"koenig-plus-menu\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/koenig-slash-menu-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: koenig-slash-menu', function () {
        (0, _emberMocha.setupComponentTest)('koenig-slash-menu', {
            integration: true
        });

        _mocha.it.skip('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#koenig-slash-menu}}
            //     template content
            //   {{/koenig-slash-menu}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "Bnm3MuXw",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"koenig-slash-menu\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/koenig-toolbar-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: koenig-toolbar', function () {
        (0, _emberMocha.setupComponentTest)('koenig-toolbar', {
            integration: true
        });

        (0, _mocha.it)('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#koenig-toolbar}}
            //     template content
            //   {{/koenig-toolbar}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "5hzESGln",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"koenig-toolbar\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/modals/delete-subscriber-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: modal-delete-subscriber', function () {
        (0, _emberMocha.setupComponentTest)('modal-delete-subscriber', {
            integration: true
        });

        (0, _mocha.it)('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#modal-delete-subscriber}}
            //     template content
            //   {{/modal-delete-subscriber}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "PVY/+fLJ",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"modal-delete-subscriber\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/modals/import-subscribers-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: modal-import-subscribers', function () {
        (0, _emberMocha.setupComponentTest)('modal-import-subscribers', {
            integration: true
        });

        (0, _mocha.it)('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#modal-import-subscribers}}
            //     template content
            //   {{/modal-import-subscribers}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "BX4NofXT",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"modal-import-subscribers\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/modals/new-subscriber-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: modal-new-subscriber', function () {
        (0, _emberMocha.setupComponentTest)('modal-new-subscriber', {
            integration: true
        });

        (0, _mocha.it)('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#modal-new-subscriber}}
            //     template content
            //   {{/modal-new-subscriber}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "8d+Pz/tQ",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"modal-new-subscriber\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/modals/upload-theme-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: modal-upload-theme', function () {
        (0, _emberMocha.setupComponentTest)('modal-upload-theme', {
            integration: true
        });

        (0, _mocha.it)('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#modal-upload-theme}}
            //     template content
            //   {{/modal-upload-theme}}
            // `);

            this.render(Ember.HTMLBars.template({
                "id": "R0Vu+yiL",
                "block": "{\"symbols\":[],\"statements\":[[1,[20,\"modal-upload-theme\"],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$()).to.have.length(1);
        });
    });
});
define('ghost-admin/tests/integration/components/transfer-owner-test', ['sinon', 'mocha', 'chai', 'ember-mocha'], function (_sinon, _mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Component: modal-transfer-owner', function () {
        (0, _emberMocha.setupComponentTest)('transfer-owner', {
            integration: true
        });

        (0, _mocha.it)('triggers confirm action', function () {
            let confirm = _sinon.default.stub();
            let closeModal = _sinon.default.spy();

            confirm.returns(Ember.RSVP.resolve({}));

            this.on('confirm', confirm);
            this.on('closeModal', closeModal);

            this.render(Ember.HTMLBars.template({
                "id": "kAYAUgAk",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"modal-transfer-owner\",null,[[\"confirm\",\"closeModal\"],[[26,\"action\",[[21,0,[]],\"confirm\"],null],[26,\"action\",[[21,0,[]],\"closeModal\"],null]]]],false]],\"hasEval\":false}",
                "meta": {}
            }));

            Ember.run(() => {
                this.$('.gh-btn.gh-btn-red').click();
            });

            (0, _chai.expect)(confirm.calledOnce, 'confirm called').to.be.true;
            (0, _chai.expect)(closeModal.calledOnce, 'closeModal called').to.be.true;
        });
    });
});
define('ghost-admin/tests/integration/helpers/background-image-style-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Helper: background-image-style', function () {
        (0, _emberMocha.setupComponentTest)('background-image-style', {
            integration: true
        });

        (0, _mocha.it)('renders', function () {
            this.render(Ember.HTMLBars.template({
                "id": "VANMEaRB",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"background-image-style\",[\"test.png\"],null],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$().text().trim()).to.equal('background-image: url(test.png);');
        });

        (0, _mocha.it)('escapes URLs', function () {
            this.render(Ember.HTMLBars.template({
                "id": "IQ+SgLc4",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"background-image-style\",[\"test image.png\"],null],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$().text().trim()).to.equal('background-image: url(test%20image.png);');
        });

        (0, _mocha.it)('handles already escaped URLs', function () {
            this.render(Ember.HTMLBars.template({
                "id": "IVjuokAz",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"background-image-style\",[\"test%20image.png\"],null],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$().text().trim()).to.equal('background-image: url(test%20image.png);');
        });

        (0, _mocha.it)('handles empty URLs', function () {
            this.set('testImage', undefined);
            this.render(Ember.HTMLBars.template({
                "id": "3gAGtc9e",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"background-image-style\",[[22,[\"testImage\"]]],null],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$().text().trim(), 'undefined').to.equal('');

            this.set('testImage', null);
            this.render(Ember.HTMLBars.template({
                "id": "3gAGtc9e",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"background-image-style\",[[22,[\"testImage\"]]],null],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$().text().trim(), 'null').to.equal('');

            this.set('testImage', '');
            this.render(Ember.HTMLBars.template({
                "id": "3gAGtc9e",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"background-image-style\",[[22,[\"testImage\"]]],null],false]],\"hasEval\":false}",
                "meta": {}
            }));
            (0, _chai.expect)(this.$().text().trim(), 'blank').to.equal('');
        });
    });
});
define('ghost-admin/tests/integration/helpers/clean-basic-html-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Helper: clean-basic-html', function () {
        (0, _emberMocha.setupComponentTest)('clean-basic-html', {
            integration: true
        });

        (0, _mocha.it)('renders', function () {
            // Set any properties with this.set('myProperty', 'value');
            // Handle any actions with this.on('myAction', function(val) { ... });
            // Template block usage:
            // this.render(hbs`
            //   {{#clean-basic-html}}
            //     template content
            //   {{/clean-basic-html}}
            // `);
            this.set('inputValue', '1234');

            this.render(Ember.HTMLBars.template({
                "id": "UI1I2m2T",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"clean-basic-html\",[[22,[\"inputValue\"]]],null],false]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _chai.expect)(this.$().text().trim()).to.equal('1234');
        });
    });
});
define('ghost-admin/tests/integration/helpers/sanitize-html-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Helper: sanitize-html', function () {
        (0, _emberMocha.setupComponentTest)('sanitize-html', {
            integration: true
        });

        (0, _mocha.it)('renders html', function () {
            this.set('inputValue', '<strong>bold</strong>');

            this.render(Ember.HTMLBars.template({
                "id": "V0VTfpVv",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"sanitize-html\",[[22,[\"inputValue\"]]],null],true]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _chai.expect)(this.$().html().trim()).to.equal('<strong>bold</strong>');
        });

        (0, _mocha.it)('replaces scripts', function () {
            this.set('inputValue', '<script></script>');

            this.render(Ember.HTMLBars.template({
                "id": "V0VTfpVv",
                "block": "{\"symbols\":[],\"statements\":[[1,[26,\"sanitize-html\",[[22,[\"inputValue\"]]],null],true]],\"hasEval\":false}",
                "meta": {}
            }));

            (0, _chai.expect)(this.$().html().trim()).to.equal('<pre class="js-embed-placeholder">Embedded JavaScript</pre>');
        });
    });
});
define('ghost-admin/tests/integration/services/ajax-test', ['pretender', 'ghost-admin/config/environment', 'mocha', 'chai', 'ember-ajax/errors', 'ghost-admin/services/ajax', 'ember-mocha'], function (_pretender, _environment, _mocha, _chai, _errors, _ajax, _emberMocha) {
    'use strict';

    var _slicedToArray = function () {
        function sliceIterator(arr, i) {
            var _arr = [];
            var _n = true;
            var _d = false;
            var _e = undefined;

            try {
                for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
                    _arr.push(_s.value);

                    if (i && _arr.length === i) break;
                }
            } catch (err) {
                _d = true;
                _e = err;
            } finally {
                try {
                    if (!_n && _i["return"]) _i["return"]();
                } finally {
                    if (_d) throw _e;
                }
            }

            return _arr;
        }

        return function (arr, i) {
            if (Array.isArray(arr)) {
                return arr;
            } else if (Symbol.iterator in Object(arr)) {
                return sliceIterator(arr, i);
            } else {
                throw new TypeError("Invalid attempt to destructure non-iterable instance");
            }
        };
    }();

    function stubAjaxEndpoint(server, response = {}, code = 200) {
        server.get('/test/', function () {
            return [code, { 'Content-Type': 'application/json' }, JSON.stringify(response)];
        });
    }

    (0, _mocha.describe)('Integration: Service: ajax', function () {
        (0, _emberMocha.setupTest)('service:ajax', {
            integration: true
        });

        let server;

        beforeEach(function () {
            server = new _pretender.default();
        });

        afterEach(function () {
            server.shutdown();
        });

        (0, _mocha.it)('adds Ghost version header to requests', function (done) {
            let version = _environment.default.APP.version;

            let ajax = this.subject();

            stubAjaxEndpoint(server, {});

            ajax.request('/test/').then(() => {
                var _server$handledReques = _slicedToArray(server.handledRequests, 1);

                let request = _server$handledReques[0];

                (0, _chai.expect)(request.requestHeaders['X-Ghost-Version']).to.equal(version);
                done();
            });
        });

        (0, _mocha.it)('correctly parses single message response text', function (done) {
            let error = { message: 'Test Error' };
            stubAjaxEndpoint(server, error, 500);

            let ajax = this.subject();

            ajax.request('/test/').then(() => {
                (0, _chai.expect)(false).to.be.true();
            }).catch(error => {
                (0, _chai.expect)(error.payload.errors.length).to.equal(1);
                (0, _chai.expect)(error.payload.errors[0].message).to.equal('Test Error');
                done();
            });
        });

        (0, _mocha.it)('correctly parses single error response text', function (done) {
            let error = { error: 'Test Error' };
            stubAjaxEndpoint(server, error, 500);

            let ajax = this.subject();

            ajax.request('/test/').then(() => {
                (0, _chai.expect)(false).to.be.true();
            }).catch(error => {
                (0, _chai.expect)(error.payload.errors.length).to.equal(1);
                (0, _chai.expect)(error.payload.errors[0].message).to.equal('Test Error');
                done();
            });
        });

        (0, _mocha.it)('correctly parses multiple error messages', function (done) {
            let error = { errors: ['First Error', 'Second Error'] };
            stubAjaxEndpoint(server, error, 500);

            let ajax = this.subject();

            ajax.request('/test/').then(() => {
                (0, _chai.expect)(false).to.be.true();
            }).catch(error => {
                (0, _chai.expect)(error.payload.errors.length).to.equal(2);
                (0, _chai.expect)(error.payload.errors[0].message).to.equal('First Error');
                (0, _chai.expect)(error.payload.errors[1].message).to.equal('Second Error');
                done();
            });
        });

        (0, _mocha.it)('returns default error object for non built-in error', function (done) {
            stubAjaxEndpoint(server, {}, 500);

            let ajax = this.subject();

            ajax.request('/test/').then(() => {
                (0, _chai.expect)(false).to.be.true;
            }).catch(error => {
                (0, _chai.expect)((0, _errors.isAjaxError)(error)).to.be.true;
                done();
            });
        });

        (0, _mocha.it)('handles error checking for built-in errors', function (done) {
            stubAjaxEndpoint(server, '', 401);

            let ajax = this.subject();

            ajax.request('/test/').then(() => {
                (0, _chai.expect)(false).to.be.true;
            }).catch(error => {
                (0, _chai.expect)((0, _errors.isUnauthorizedError)(error)).to.be.true;
                done();
            });
        });

        (0, _mocha.it)('handles error checking for VersionMismatchError', function (done) {
            server.get('/test/', function () {
                return [400, { 'Content-Type': 'application/json' }, JSON.stringify({
                    errors: [{
                        errorType: 'VersionMismatchError',
                        statusCode: 400
                    }]
                })];
            });

            let ajax = this.subject();

            ajax.request('/test/').then(() => {
                (0, _chai.expect)(false).to.be.true;
            }).catch(error => {
                (0, _chai.expect)((0, _ajax.isVersionMismatchError)(error)).to.be.true;
                done();
            });
        });

        (0, _mocha.it)('handles error checking for RequestEntityTooLargeError on 413 errors', function (done) {
            stubAjaxEndpoint(server, {}, 413);

            let ajax = this.subject();

            ajax.request('/test/').then(() => {
                (0, _chai.expect)(false).to.be.true;
            }).catch(error => {
                (0, _chai.expect)((0, _ajax.isRequestEntityTooLargeError)(error)).to.be.true;
                done();
            });
        });

        (0, _mocha.it)('handles error checking for UnsupportedMediaTypeError on 415 errors', function (done) {
            stubAjaxEndpoint(server, {}, 415);

            let ajax = this.subject();

            ajax.request('/test/').then(() => {
                (0, _chai.expect)(false).to.be.true;
            }).catch(error => {
                (0, _chai.expect)((0, _ajax.isUnsupportedMediaTypeError)(error)).to.be.true;
                done();
            });
        });

        /* eslint-disable camelcase */
        (0, _mocha.describe)('session handling', function () {
            let sessionStub = Ember.Service.extend({
                isAuthenticated: true,
                restoreCalled: false,
                authenticated: null,

                init() {
                    this._super(...arguments);
                    let authenticated = {
                        expires_at: new Date().getTime() - 10000,
                        access_token: 'AccessMe123',
                        refresh_token: 'RefreshMe123'
                    };
                    this.authenticated = authenticated;
                    this.data = { authenticated };
                },

                restore() {
                    this.restoreCalled = true;
                    this.authenticated.expires_at = new Date().getTime() + 10000;
                    return Ember.RSVP.resolve();
                },

                authorize() {}
            });

            beforeEach(function () {
                server.get('/ghost/api/v0.1/test/', function () {
                    return [200, { 'Content-Type': 'application/json' }, JSON.stringify({
                        success: true
                    })];
                });

                server.post('/ghost/api/v0.1/authentication/token', function () {
                    return [401, { 'Content-Type': 'application/json' }, JSON.stringify({})];
                });
            });

            (0, _mocha.it)('can restore an expired session', function (done) {
                let ajax = this.subject();
                ajax.set('session', sessionStub.create());

                ajax.request('/ghost/api/v0.1/test/');

                ajax.request('/ghost/api/v0.1/test/').then(result => {
                    (0, _chai.expect)(ajax.get('session.restoreCalled'), 'restoreCalled').to.be.true;
                    (0, _chai.expect)(result.success, 'result.success').to.be.true;
                    done();
                }).catch(() => {
                    (0, _chai.expect)(true, 'request failed').to.be.false;
                    done();
                });
            });

            (0, _mocha.it)('errors correctly when session restoration fails', function (done) {
                let ajax = this.subject();
                let invalidateCalled = false;

                ajax.set('session', sessionStub.create());
                ajax.set('session.restore', function () {
                    this.set('restoreCalled', true);
                    return ajax.post('/ghost/api/v0.1/authentication/token');
                });
                ajax.set('session.invalidate', function () {
                    invalidateCalled = true;
                });

                stubAjaxEndpoint(server, {}, 401);

                ajax.request('/ghost/api/v0.1/test/').then(() => {
                    (0, _chai.expect)(true, 'request was successful').to.be.false;
                    done();
                }).catch(() => {
                    // TODO: fix the error return when a session restore fails
                    // expect(isUnauthorizedError(error)).to.be.true;
                    (0, _chai.expect)(ajax.get('session.restoreCalled'), 'restoreCalled').to.be.true;
                    (0, _chai.expect)(invalidateCalled, 'invalidateCalled').to.be.true;
                    done();
                });
            });
        });
    });
});
define('ghost-admin/tests/integration/services/config-test', ['pretender', 'ember-test-helpers/wait', 'mocha', 'chai', 'ember-mocha'], function (_pretender, _wait, _mocha, _chai, _emberMocha) {
    'use strict';

    function stubAvailableTimezonesEndpoint(server) {
        server.get('/ghost/api/v0.1/configuration/timezones', function () {
            return [200, { 'Content-Type': 'application/json' }, JSON.stringify({
                configuration: [{
                    timezones: [{
                        label: '(GMT -11:00) Midway Island, Samoa',
                        name: 'Pacific/Pago_Pago',
                        offset: -660
                    }, {
                        label: '(GMT) Greenwich Mean Time : Dublin, Edinburgh, London',
                        name: 'Europe/Dublin',
                        offset: 0
                    }]
                }]
            })];
        });
    }

    (0, _mocha.describe)('Integration: Service: config', function () {
        (0, _emberMocha.setupTest)('service:config', {
            integration: true
        });

        let server;

        beforeEach(function () {
            server = new _pretender.default();
        });

        afterEach(function () {
            server.shutdown();
        });

        (0, _mocha.it)('returns a list of timezones in the expected format', function (done) {
            let service = this.subject();
            stubAvailableTimezonesEndpoint(server);

            service.get('availableTimezones').then(function (timezones) {
                (0, _chai.expect)(timezones.length).to.equal(2);
                (0, _chai.expect)(timezones[0].name).to.equal('Pacific/Pago_Pago');
                (0, _chai.expect)(timezones[0].label).to.equal('(GMT -11:00) Midway Island, Samoa');
                (0, _chai.expect)(timezones[1].name).to.equal('Europe/Dublin');
                (0, _chai.expect)(timezones[1].label).to.equal('(GMT) Greenwich Mean Time : Dublin, Edinburgh, London');
                done();
            });
        });

        (0, _mocha.it)('normalizes blogUrl to non-trailing-slash', function (done) {
            let stubBlogUrl = function stubBlogUrl(blogUrl) {
                server.get('/ghost/api/v0.1/configuration/', function () {
                    return [200, { 'Content-Type': 'application/json' }, JSON.stringify({
                        configuration: [{
                            blogUrl
                        }]
                    })];
                });
            };
            let service = this.subject();

            stubBlogUrl('http://localhost:2368/');

            service.fetch().then(() => {
                (0, _chai.expect)(service.get('blogUrl'), 'trailing-slash').to.equal('http://localhost:2368');
            });

            (0, _wait.default)().then(() => {
                stubBlogUrl('http://localhost:2368');

                service.fetch().then(() => {
                    (0, _chai.expect)(service.get('blogUrl'), 'non-trailing-slash').to.equal('http://localhost:2368');

                    done();
                });
            });
        });
    });
});
define('ghost-admin/tests/integration/services/feature-test', ['ghost-admin/services/feature', 'pretender', 'ember-test-helpers/wait', 'mocha', 'ember-mocha'], function (_feature, _pretender, _wait, _mocha, _emberMocha) {
    'use strict';

    function stubSettings(server, labs, validSave = true) {
        let settings = [{
            id: '1',
            type: 'blog',
            key: 'labs',
            value: JSON.stringify(labs)
        }];

        server.get('/ghost/api/v0.1/settings/', function () {
            return [200, { 'Content-Type': 'application/json' }, JSON.stringify({ settings })];
        });

        server.put('/ghost/api/v0.1/settings/', function (request) {
            let statusCode = validSave ? 200 : 400;
            let response = validSave ? request.requestBody : JSON.stringify({
                errors: [{
                    message: 'Test Error'
                }]
            });

            return [statusCode, { 'Content-Type': 'application/json' }, response];
        });
    }

    function stubUser(server, accessibility, validSave = true) {
        let users = [{
            id: '1',
            // Add extra properties for the validations
            name: 'Test User',
            email: 'test@example.com',
            accessibility: JSON.stringify(accessibility),
            roles: [{
                id: 1,
                name: 'Owner',
                description: 'Owner'
            }]
        }];

        server.get('/ghost/api/v0.1/users/me/', function () {
            return [200, { 'Content-Type': 'application/json' }, JSON.stringify({ users })];
        });

        server.put('/ghost/api/v0.1/users/1/', function (request) {
            let statusCode = validSave ? 200 : 400;
            let response = validSave ? request.requestBody : JSON.stringify({
                errors: [{
                    message: 'Test Error'
                }]
            });

            return [statusCode, { 'Content-Type': 'application/json' }, response];
        });
    }

    function addTestFlag() {
        _feature.default.reopen({
            testFlag: (0, _feature.feature)('testFlag'),
            testUserFlag: (0, _feature.feature)('testUserFlag', { user: true })
        });
    }

    (0, _mocha.describe)('Integration: Service: feature', function () {
        (0, _emberMocha.setupTest)('service:feature', {
            integration: true
        });

        let server;

        beforeEach(function () {
            server = new _pretender.default();
        });

        afterEach(function () {
            server.shutdown();
        });

        (0, _mocha.it)('loads labs and user settings correctly', function () {
            stubSettings(server, { testFlag: true });
            stubUser(server, { testUserFlag: true });

            addTestFlag();

            let service = this.subject();

            return service.fetch().then(() => {
                expect(service.get('testFlag')).to.be.true;
                expect(service.get('testUserFlag')).to.be.true;
            });
        });

        (0, _mocha.it)('returns false for set flag with config false and labs false', function () {
            stubSettings(server, { testFlag: false });
            stubUser(server, {});

            addTestFlag();

            let service = this.subject();
            service.get('config').set('testFlag', false);

            return service.fetch().then(() => {
                expect(service.get('labs.testFlag')).to.be.false;
                expect(service.get('testFlag')).to.be.false;
            });
        });

        (0, _mocha.it)('returns true for set flag with config true and labs false', function () {
            stubSettings(server, { testFlag: false });
            stubUser(server, {});

            addTestFlag();

            let service = this.subject();
            service.get('config').set('testFlag', true);

            return service.fetch().then(() => {
                expect(service.get('labs.testFlag')).to.be.false;
                expect(service.get('testFlag')).to.be.true;
            });
        });

        (0, _mocha.it)('returns true for set flag with config false and labs true', function () {
            stubSettings(server, { testFlag: true });
            stubUser(server, {});

            addTestFlag();

            let service = this.subject();
            service.get('config').set('testFlag', false);

            return service.fetch().then(() => {
                expect(service.get('labs.testFlag')).to.be.true;
                expect(service.get('testFlag')).to.be.true;
            });
        });

        (0, _mocha.it)('returns true for set flag with config true and labs true', function () {
            stubSettings(server, { testFlag: true });
            stubUser(server, {});

            addTestFlag();

            let service = this.subject();
            service.get('config').set('testFlag', true);

            return service.fetch().then(() => {
                expect(service.get('labs.testFlag')).to.be.true;
                expect(service.get('testFlag')).to.be.true;
            });
        });

        (0, _mocha.it)('returns false for set flag with accessibility false', function () {
            stubSettings(server, {});
            stubUser(server, { testUserFlag: false });

            addTestFlag();

            let service = this.subject();

            return service.fetch().then(() => {
                expect(service.get('accessibility.testUserFlag')).to.be.false;
                expect(service.get('testUserFlag')).to.be.false;
            });
        });

        (0, _mocha.it)('returns true for set flag with accessibility true', function () {
            stubSettings(server, {});
            stubUser(server, { testUserFlag: true });

            addTestFlag();

            let service = this.subject();

            return service.fetch().then(() => {
                expect(service.get('accessibility.testUserFlag')).to.be.true;
                expect(service.get('testUserFlag')).to.be.true;
            });
        });

        (0, _mocha.it)('saves labs setting correctly', function () {
            stubSettings(server, { testFlag: false });
            stubUser(server, { testUserFlag: false });

            addTestFlag();

            let service = this.subject();
            service.get('config').set('testFlag', false);

            return service.fetch().then(() => {
                expect(service.get('testFlag')).to.be.false;

                Ember.run(() => {
                    service.set('testFlag', true);
                });

                return (0, _wait.default)().then(() => {
                    expect(server.handlers[1].numberOfCalls).to.equal(1);
                    expect(service.get('testFlag')).to.be.true;
                });
            });
        });

        (0, _mocha.it)('saves accessibility setting correctly', function () {
            stubSettings(server, {});
            stubUser(server, { testUserFlag: false });

            addTestFlag();

            let service = this.subject();

            return service.fetch().then(() => {
                expect(service.get('testUserFlag')).to.be.false;

                Ember.run(() => {
                    service.set('testUserFlag', true);
                });

                return (0, _wait.default)().then(() => {
                    expect(server.handlers[3].numberOfCalls).to.equal(1);
                    expect(service.get('testUserFlag')).to.be.true;
                });
            });
        });

        (0, _mocha.it)('notifies for server errors on labs save', function () {
            stubSettings(server, { testFlag: false }, false);
            stubUser(server, {});

            addTestFlag();

            let service = this.subject();
            service.get('config').set('testFlag', false);

            return service.fetch().then(() => {
                expect(service.get('testFlag')).to.be.false;

                Ember.run(() => {
                    service.set('testFlag', true);
                });

                return (0, _wait.default)().then(() => {
                    expect(server.handlers[1].numberOfCalls, 'PUT call is made').to.equal(1);

                    expect(service.get('notifications.alerts').length, 'number of alerts shown').to.equal(1);

                    expect(service.get('testFlag')).to.be.false;
                });
            });
        });

        (0, _mocha.it)('notifies for server errors on accessibility save', function () {
            stubSettings(server, {});
            stubUser(server, { testUserFlag: false }, false);

            addTestFlag();

            let service = this.subject();

            return service.fetch().then(() => {
                expect(service.get('testUserFlag')).to.be.false;

                Ember.run(() => {
                    service.set('testUserFlag', true);
                });

                return (0, _wait.default)().then(() => {
                    expect(server.handlers[3].numberOfCalls, 'PUT call is made').to.equal(1);

                    expect(service.get('notifications.alerts').length, 'number of alerts shown').to.equal(1);

                    expect(service.get('testUserFlag')).to.be.false;
                });
            });
        });

        (0, _mocha.it)('notifies for validation errors', function () {
            stubSettings(server, { testFlag: false }, true, false);
            stubUser(server, {});

            addTestFlag();

            let service = this.subject();
            service.get('config').set('testFlag', false);

            return service.fetch().then(() => {
                expect(service.get('testFlag')).to.be.false;

                Ember.run(() => {
                    expect(() => {
                        service.set('testFlag', true);
                    }, Ember.Error, 'threw validation error');
                });

                return (0, _wait.default)().then(() => {
                    // ensure validation is happening before the API is hit
                    expect(server.handlers[1].numberOfCalls).to.equal(0);
                    expect(service.get('testFlag')).to.be.false;
                });
            });
        });
    });
});
define('ghost-admin/tests/integration/services/lazy-loader-test', ['pretender', 'mocha', 'chai', 'ember-mocha'], function (_pretender, _mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Integration: Service: lazy-loader', function () {
        (0, _emberMocha.setupTest)('service:lazy-loader', { integration: true });
        let server;
        let ghostPaths = {
            adminRoot: '/assets/'
        };

        beforeEach(function () {
            server = new _pretender.default();
        });

        afterEach(function () {
            server.shutdown();
        });

        (0, _mocha.it)('loads a script correctly and only once', function () {
            let subject = this.subject({
                ghostPaths,
                scriptPromises: {},
                testing: false
            });

            server.get('/assets/test.js', function ({ requestHeaders }) {
                (0, _chai.expect)(requestHeaders.Accept).to.match(/text\/javascript/);

                return [200, { 'Content-Type': 'text/javascript' }, 'window.testLoadScript = \'testvalue\''];
            });

            return subject.loadScript('test-script', 'test.js').then(() => {
                (0, _chai.expect)(subject.get('scriptPromises.test-script')).to.exist;
                (0, _chai.expect)(window.testLoadScript).to.equal('testvalue');
                (0, _chai.expect)(server.handlers[0].numberOfCalls).to.equal(1);

                return subject.loadScript('test-script', 'test.js');
            }).then(() => {
                (0, _chai.expect)(server.handlers[0].numberOfCalls).to.equal(1);
            });
        });

        (0, _mocha.it)('loads styles correctly', function () {
            let subject = this.subject({
                ghostPaths,
                testing: false
            });

            return subject.loadStyle('testing', 'style.css').catch(() => {
                // we add a catch handler here because `/assets/style.css` doesn't exist
                (0, _chai.expect)(Ember.$('#testing-styles').length).to.equal(1);
                (0, _chai.expect)(Ember.$('#testing-styles').attr('href')).to.equal('/assets/style.css');
            });
        });
    });
});
define('ghost-admin/tests/integration/services/slug-generator-test', ['pretender', 'mocha', 'chai', 'ember-mocha'], function (_pretender, _mocha, _chai, _emberMocha) {
    'use strict';

    function stubSlugEndpoint(server, type, slug) {
        server.get('/ghost/api/v0.1/slugs/:type/:slug/', function (request) {
            (0, _chai.expect)(request.params.type).to.equal(type);
            (0, _chai.expect)(request.params.slug).to.equal(slug);

            return [200, { 'Content-Type': 'application/json' }, JSON.stringify({ slugs: [{ slug: Ember.String.dasherize(slug) }] })];
        });
    }

    (0, _mocha.describe)('Integration: Service: slug-generator', function () {
        (0, _emberMocha.setupTest)('service:slug-generator', {
            integration: true
        });

        let server;

        beforeEach(function () {
            server = new _pretender.default();
        });

        afterEach(function () {
            server.shutdown();
        });

        (0, _mocha.it)('returns empty if no slug is provided', function (done) {
            let service = this.subject();

            service.generateSlug('post', '').then(function (slug) {
                (0, _chai.expect)(slug).to.equal('');
                done();
            });
        });

        (0, _mocha.it)('calls correct endpoint and returns correct data', function (done) {
            let rawSlug = 'a test post';
            stubSlugEndpoint(server, 'post', rawSlug);

            let service = this.subject();

            service.generateSlug('post', rawSlug).then(function (slug) {
                (0, _chai.expect)(slug).to.equal(Ember.String.dasherize(rawSlug));
                done();
            });
        });
    });
});
define('ghost-admin/tests/integration/services/store-test', ['pretender', 'ghost-admin/config/environment', 'mocha', 'chai', 'ember-mocha'], function (_pretender, _environment, _mocha, _chai, _emberMocha) {
    'use strict';

    var _slicedToArray = function () {
        function sliceIterator(arr, i) {
            var _arr = [];
            var _n = true;
            var _d = false;
            var _e = undefined;

            try {
                for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
                    _arr.push(_s.value);

                    if (i && _arr.length === i) break;
                }
            } catch (err) {
                _d = true;
                _e = err;
            } finally {
                try {
                    if (!_n && _i["return"]) _i["return"]();
                } finally {
                    if (_d) throw _e;
                }
            }

            return _arr;
        }

        return function (arr, i) {
            if (Array.isArray(arr)) {
                return arr;
            } else if (Symbol.iterator in Object(arr)) {
                return sliceIterator(arr, i);
            } else {
                throw new TypeError("Invalid attempt to destructure non-iterable instance");
            }
        };
    }();

    (0, _mocha.describe)('Integration: Service: store', function () {
        (0, _emberMocha.setupTest)('service:store', {
            integration: true
        });

        let server;

        beforeEach(function () {
            server = new _pretender.default();
        });

        afterEach(function () {
            server.shutdown();
        });

        (0, _mocha.it)('adds Ghost version header to requests', function (done) {
            let version = _environment.default.APP.version;

            let store = this.subject();

            server.get('/ghost/api/v0.1/posts/1/', function () {
                return [404, { 'Content-Type': 'application/json' }, JSON.stringify({})];
            });

            store.find('post', 1).catch(() => {
                var _server$handledReques = _slicedToArray(server.handledRequests, 1);

                let request = _server$handledReques[0];

                (0, _chai.expect)(request.requestHeaders['X-Ghost-Version']).to.equal(version);
                done();
            });
        });
    });
});
define('ghost-admin/tests/test-helper', ['ghost-admin/tests/helpers/resolver', 'ember-mocha'], function (_resolver, _emberMocha) {
    'use strict';

    (0, _emberMocha.setResolver)(_resolver.default);

    mocha.setup({
        timeout: 15000,
        slow: 500
    });
});
define('ghost-admin/tests/tests.lint-test', [], function () {
  'use strict';

  describe('ESLint | tests', function () {

    it('acceptance/authentication-test.js', function () {
      // test passed
    });

    it('acceptance/content-test.js', function () {
      // test passed
    });

    it('acceptance/custom-post-templates-test.js', function () {
      // test passed
    });

    it('acceptance/editor-test.js', function () {
      // test passed
    });

    it('acceptance/error-handling-test.js', function () {
      // test passed
    });

    it('acceptance/ghost-desktop-test.js', function () {
      // test passed
    });

    it('acceptance/password-reset-test.js', function () {
      // test passed
    });

    it('acceptance/settings/amp-test.js', function () {
      // test passed
    });

    it('acceptance/settings/apps-test.js', function () {
      // test passed
    });

    it('acceptance/settings/code-injection-test.js', function () {
      // test passed
    });

    it('acceptance/settings/design-test.js', function () {
      // test passed
    });

    it('acceptance/settings/general-test.js', function () {
      // test passed
    });

    it('acceptance/settings/labs-test.js', function () {
      // test passed
    });

    it('acceptance/settings/slack-test.js', function () {
      // test passed
    });

    it('acceptance/settings/tags-test.js', function () {
      // test passed
    });

    it('acceptance/settings/unsplash-test.js', function () {
      // test passed
    });

    it('acceptance/setup-test.js', function () {
      // test passed
    });

    it('acceptance/signin-test.js', function () {
      // test passed
    });

    it('acceptance/signup-test.js', function () {
      // test passed
    });

    it('acceptance/subscribers-test.js', function () {
      // test passed
    });

    it('acceptance/team-test.js', function () {
      // test passed
    });

    it('helpers/adapter-error.js', function () {
      // test passed
    });

    it('helpers/destroy-app.js', function () {
      // test passed
    });

    it('helpers/file-upload.js', function () {
      // test passed
    });

    it('helpers/resolver.js', function () {
      // test passed
    });

    it('helpers/start-app.js', function () {
      // test passed
    });

    it('integration/adapters/tag-test.js', function () {
      // test passed
    });

    it('integration/adapters/user-test.js', function () {
      // test passed
    });

    it('integration/components/gh-alert-test.js', function () {
      // test passed
    });

    it('integration/components/gh-alerts-test.js', function () {
      // test passed
    });

    it('integration/components/gh-basic-dropdown-test.js', function () {
      // test passed
    });

    it('integration/components/gh-cm-editor-test.js', function () {
      // test passed
    });

    it('integration/components/gh-date-time-picker-test.js', function () {
      // test passed
    });

    it('integration/components/gh-download-count-test.js', function () {
      // test passed
    });

    it('integration/components/gh-editor-post-status-test.js', function () {
      // test passed
    });

    it('integration/components/gh-feature-flag-test.js', function () {
      // test passed
    });

    it('integration/components/gh-file-uploader-test.js', function () {
      // test passed
    });

    it('integration/components/gh-image-uploader-test.js', function () {
      // test passed
    });

    it('integration/components/gh-image-uploader-with-preview-test.js', function () {
      // test passed
    });

    it('integration/components/gh-koenig-editor-test.js', function () {
      // test passed
    });

    it('integration/components/gh-markdown-editor-test.js', function () {
      // test passed
    });

    it('integration/components/gh-navitem-test.js', function () {
      // test passed
    });

    it('integration/components/gh-navitem-url-input-test.js', function () {
      // test passed
    });

    it('integration/components/gh-notification-test.js', function () {
      // test passed
    });

    it('integration/components/gh-notifications-test.js', function () {
      // test passed
    });

    it('integration/components/gh-profile-image-test.js', function () {
      // test passed
    });

    it('integration/components/gh-progress-bar-test.js', function () {
      // test passed
    });

    it('integration/components/gh-psm-tags-input-test.js', function () {
      // test passed
    });

    it('integration/components/gh-psm-template-select-test.js', function () {
      // test passed
    });

    it('integration/components/gh-publishmenu-draft-test.js', function () {
      // test passed
    });

    it('integration/components/gh-publishmenu-published-test.js', function () {
      // test passed
    });

    it('integration/components/gh-publishmenu-scheduled-test.js', function () {
      // test passed
    });

    it('integration/components/gh-publishmenu-test.js', function () {
      // test passed
    });

    it('integration/components/gh-search-input-test.js', function () {
      // test passed
    });

    it('integration/components/gh-simplemde-test.js', function () {
      // test passed
    });

    it('integration/components/gh-subscribers-table-test.js', function () {
      // test passed
    });

    it('integration/components/gh-tag-settings-form-test.js', function () {
      // test passed
    });

    it('integration/components/gh-tags-management-container-test.js', function () {
      // test passed
    });

    it('integration/components/gh-task-button-test.js', function () {
      // test passed
    });

    it('integration/components/gh-theme-table-test.js', function () {
      // test passed
    });

    it('integration/components/gh-timezone-select-test.js', function () {
      // test passed
    });

    it('integration/components/gh-trim-focus-input-test.js', function () {
      // test passed
    });

    it('integration/components/gh-unsplash-photo-test.js', function () {
      // test passed
    });

    it('integration/components/gh-unsplash-test.js', function () {
      // test passed
    });

    it('integration/components/gh-uploader-test.js', function () {
      // test passed
    });

    it('integration/components/gh-validation-status-container-test.js', function () {
      // test passed
    });

    it('integration/components/koenig-basic-html-input-test.js', function () {
      // test passed
    });

    it('integration/components/koenig-caption-input-test.js', function () {
      // test passed
    });

    it('integration/components/koenig-card-embed-test.js', function () {
      // test passed
    });

    it('integration/components/koenig-card-gallery-test.js', function () {
      // test passed
    });

    it('integration/components/koenig-card-html-test.js', function () {
      // test passed
    });

    it('integration/components/koenig-card-image-test.js', function () {
      // test passed
    });

    it('integration/components/koenig-card-markdown-test.js', function () {
      // test passed
    });

    it('integration/components/koenig-editor-test.js', function () {
      // test passed
    });

    it('integration/components/koenig-link-input-test.js', function () {
      // test passed
    });

    it('integration/components/koenig-link-toolbar-test.js', function () {
      // test passed
    });

    it('integration/components/koenig-plus-menu-test.js', function () {
      // test passed
    });

    it('integration/components/koenig-slash-menu-test.js', function () {
      // test passed
    });

    it('integration/components/koenig-toolbar-test.js', function () {
      // test passed
    });

    it('integration/components/modals/delete-subscriber-test.js', function () {
      // test passed
    });

    it('integration/components/modals/import-subscribers-test.js', function () {
      // test passed
    });

    it('integration/components/modals/new-subscriber-test.js', function () {
      // test passed
    });

    it('integration/components/modals/upload-theme-test.js', function () {
      // test passed
    });

    it('integration/components/transfer-owner-test.js', function () {
      // test passed
    });

    it('integration/helpers/background-image-style-test.js', function () {
      // test passed
    });

    it('integration/helpers/clean-basic-html-test.js', function () {
      // test passed
    });

    it('integration/helpers/sanitize-html-test.js', function () {
      // test passed
    });

    it('integration/services/ajax-test.js', function () {
      // test passed
    });

    it('integration/services/config-test.js', function () {
      // test passed
    });

    it('integration/services/feature-test.js', function () {
      // test passed
    });

    it('integration/services/lazy-loader-test.js', function () {
      // test passed
    });

    it('integration/services/slug-generator-test.js', function () {
      // test passed
    });

    it('integration/services/store-test.js', function () {
      // test passed
    });

    it('test-helper.js', function () {
      // test passed
    });

    it('unit/components/gh-alert-test.js', function () {
      // test passed
    });

    it('unit/components/gh-app-test.js', function () {
      // test passed
    });

    it('unit/components/gh-navitem-url-input-test.js', function () {
      // test passed
    });

    it('unit/components/gh-notification-test.js', function () {
      // test passed
    });

    it('unit/components/gh-post-settings-menu-test.js', function () {
      // test passed
    });

    it('unit/components/gh-url-preview-test.js', function () {
      // test passed
    });

    it('unit/components/gh-user-active-test.js', function () {
      // test passed
    });

    it('unit/components/gh-user-invited-test.js', function () {
      // test passed
    });

    it('unit/controllers/editor-test.js', function () {
      // test passed
    });

    it('unit/controllers/settings/design-test.js', function () {
      // test passed
    });

    it('unit/controllers/subscribers-test.js', function () {
      // test passed
    });

    it('unit/helpers/gh-count-characters-test.js', function () {
      // test passed
    });

    it('unit/helpers/gh-count-down-characters-test.js', function () {
      // test passed
    });

    it('unit/helpers/gh-format-post-time-test.js', function () {
      // test passed
    });

    it('unit/helpers/gh-user-can-admin-test.js', function () {
      // test passed
    });

    it('unit/helpers/highlighted-text-test.js', function () {
      // test passed
    });

    it('unit/helpers/is-equal-test.js', function () {
      // test passed
    });

    it('unit/helpers/is-not-test.js', function () {
      // test passed
    });

    it('unit/mixins/validation-engine-test.js', function () {
      // test passed
    });

    it('unit/models/invite-test.js', function () {
      // test passed
    });

    it('unit/models/navigation-item-test.js', function () {
      // test passed
    });

    it('unit/models/post-test.js', function () {
      // test passed
    });

    it('unit/models/role-test.js', function () {
      // test passed
    });

    it('unit/models/setting-test.js', function () {
      // test passed
    });

    it('unit/models/subscriber-test.js', function () {
      // test passed
    });

    it('unit/models/tag-test.js', function () {
      // test passed
    });

    it('unit/models/user-test.js', function () {
      // test passed
    });

    it('unit/routes/subscribers-test.js', function () {
      // test passed
    });

    it('unit/routes/subscribers/import-test.js', function () {
      // test passed
    });

    it('unit/routes/subscribers/new-test.js', function () {
      // test passed
    });

    it('unit/serializers/notification-test.js', function () {
      // test passed
    });

    it('unit/serializers/post-test.js', function () {
      // test passed
    });

    it('unit/serializers/role-test.js', function () {
      // test passed
    });

    it('unit/serializers/setting-test.js', function () {
      // test passed
    });

    it('unit/serializers/subscriber-test.js', function () {
      // test passed
    });

    it('unit/serializers/tag-test.js', function () {
      // test passed
    });

    it('unit/serializers/user-test.js', function () {
      // test passed
    });

    it('unit/services/config-test.js', function () {
      // test passed
    });

    it('unit/services/event-bus-test.js', function () {
      // test passed
    });

    it('unit/services/notifications-test.js', function () {
      // test passed
    });

    it('unit/services/resize-detector-test.js', function () {
      // test passed
    });

    it('unit/services/ui-test.js', function () {
      // test passed
    });

    it('unit/services/unsplash-test.js', function () {
      // test passed
    });

    it('unit/services/upgrade-status-test.js', function () {
      // test passed
    });

    it('unit/transforms/facebook-url-user-test.js', function () {
      // test passed
    });

    it('unit/transforms/json-string-test.js', function () {
      // test passed
    });

    it('unit/transforms/navigation-settings-test.js', function () {
      // test passed
    });

    it('unit/transforms/slack-settings-test.js', function () {
      // test passed
    });

    it('unit/transforms/twitter-url-user-test.js', function () {
      // test passed
    });

    it('unit/transforms/unsplash-settings-test.js', function () {
      // test passed
    });

    it('unit/utils/ghost-paths-test.js', function () {
      // test passed
    });

    it('unit/validators/nav-item-test.js', function () {
      // test passed
    });

    it('unit/validators/slack-integration-test.js', function () {
      // test passed
    });

    it('unit/validators/subscriber-test.js', function () {
      // test passed
    });

    it('unit/validators/tag-settings-test.js', function () {
      // test passed
    });
  });
});
define('ghost-admin/tests/unit/components/gh-alert-test', ['sinon', 'mocha', 'chai', 'ember-mocha'], function (_sinon, _mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Component: gh-alert', function () {
        (0, _emberMocha.setupComponentTest)('gh-alert', {
            unit: true,
            // specify the other units that are required for this test
            needs: ['service:notifications', 'helper:svg-jar']
        });

        (0, _mocha.it)('closes notification through notifications service', function () {
            let component = this.subject();
            let notifications = {};
            let notification = { message: 'Test close', type: 'success' };

            notifications.closeNotification = _sinon.default.spy();
            component.set('notifications', notifications);
            component.set('message', notification);

            this.$().find('button').click();

            (0, _chai.expect)(notifications.closeNotification.calledWith(notification)).to.be.true;
        });
    });
});
define('ghost-admin/tests/unit/components/gh-app-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Component: gh-app', function () {
        (0, _emberMocha.setupComponentTest)('gh-app', {
            unit: true
            // specify the other units that are required for this test
            // needs: ['component:foo', 'helper:bar']
        });

        (0, _mocha.it)('renders', function () {
            // creates the component instance
            let component = this.subject();

            (0, _chai.expect)(component._state).to.equal('preRender');

            // renders the component on the page
            this.render();
            (0, _chai.expect)(component._state).to.equal('inDOM');
        });
    });
});
define('ghost-admin/tests/unit/components/gh-navitem-url-input-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Component: gh-navitem-url-input', function () {
        (0, _emberMocha.setupComponentTest)('gh-navitem-url-input', {
            unit: true
        });

        (0, _mocha.it)('identifies a URL as the base URL', function () {
            let component = this.subject({
                url: '',
                baseUrl: 'http://example.com/'
            });

            this.render();

            Ember.run(function () {
                component.set('value', 'http://example.com/');
            });

            (0, _chai.expect)(component.get('isBaseUrl')).to.be.ok;

            Ember.run(function () {
                component.set('value', 'http://example.com/go/');
            });

            (0, _chai.expect)(component.get('isBaseUrl')).to.not.be.ok;
        });
    });
});
define('ghost-admin/tests/unit/components/gh-notification-test', ['sinon', 'mocha', 'chai', 'ember-mocha'], function (_sinon, _mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Component: gh-notification', function () {
        (0, _emberMocha.setupComponentTest)('gh-notification', {
            unit: true,
            // specify the other units that are required for this test
            needs: ['service:notifications', 'helper:svg-jar']
        });

        (0, _mocha.it)('closes notification through notifications service', function () {
            let component = this.subject();
            let notifications = {};
            let notification = { message: 'Test close', type: 'success' };

            notifications.closeNotification = _sinon.default.spy();
            component.set('notifications', notifications);
            component.set('message', notification);

            this.$().find('button').click();

            (0, _chai.expect)(notifications.closeNotification.calledWith(notification)).to.be.true;
        });

        (0, _mocha.it)('closes notification when animationend event is triggered', function (done) {
            let component = this.subject();
            let notifications = {};
            let notification = { message: 'Test close', type: 'success' };

            notifications.closeNotification = _sinon.default.spy();
            component.set('notifications', notifications);
            component.set('message', notification);

            // shorten the animation delay to speed up test
            this.$().css('animation-delay', '0.1s');
            setTimeout(function () {
                (0, _chai.expect)(notifications.closeNotification.calledWith(notification)).to.be.true;
                done();
            }, 150);
        });
    });
});
define('ghost-admin/tests/unit/components/gh-post-settings-menu-test', ['ghost-admin/utils/bound-one-way', 'mocha', 'ember-mocha'], function (_boundOneWay, _mocha, _emberMocha) {
    'use strict';

    function K() {
        return this;
    }

    // TODO: convert to integration tests
    /* eslint-disable camelcase */
    _mocha.describe.skip('Unit: Component: post-settings-menu', function () {
        (0, _emberMocha.setupComponentTest)('gh-post-settings-menu', {
            needs: ['service:notifications', 'service:slug-generator', 'service:settings']
        });

        (0, _mocha.it)('slugValue is one-way bound to post.slug', function () {
            let component = this.subject({
                post: Ember.Object.create({
                    slug: 'a-slug'
                })
            });

            expect(component.get('post.slug')).to.equal('a-slug');
            expect(component.get('slugValue')).to.equal('a-slug');

            Ember.run(function () {
                component.set('post.slug', 'changed-slug');

                expect(component.get('slugValue')).to.equal('changed-slug');
            });

            Ember.run(function () {
                component.set('slugValue', 'changed-directly');

                expect(component.get('post.slug')).to.equal('changed-slug');
                expect(component.get('slugValue')).to.equal('changed-directly');
            });

            Ember.run(function () {
                // test that the one-way binding is still in place
                component.set('post.slug', 'should-update');

                expect(component.get('slugValue')).to.equal('should-update');
            });
        });

        (0, _mocha.it)('metaTitleScratch is one-way bound to post.metaTitle', function () {
            let component = this.subject({
                post: Ember.Object.extend({
                    metaTitle: 'a title',
                    metaTitleScratch: (0, _boundOneWay.default)('metaTitle')
                }).create()
            });

            expect(component.get('post.metaTitle')).to.equal('a title');
            expect(component.get('metaTitleScratch')).to.equal('a title');

            Ember.run(function () {
                component.set('post.metaTitle', 'a different title');

                expect(component.get('metaTitleScratch')).to.equal('a different title');
            });

            Ember.run(function () {
                component.set('metaTitleScratch', 'changed directly');

                expect(component.get('post.metaTitle')).to.equal('a different title');
                expect(component.get('post.metaTitleScratch')).to.equal('changed directly');
            });

            Ember.run(function () {
                // test that the one-way binding is still in place
                component.set('post.metaTitle', 'should update');

                expect(component.get('metaTitleScratch')).to.equal('should update');
            });
        });

        (0, _mocha.it)('metaDescriptionScratch is one-way bound to post.metaDescription', function () {
            let component = this.subject({
                post: Ember.Object.extend({
                    metaDescription: 'a description',
                    metaDescriptionScratch: (0, _boundOneWay.default)('metaDescription')
                }).create()
            });

            expect(component.get('post.metaDescription')).to.equal('a description');
            expect(component.get('metaDescriptionScratch')).to.equal('a description');

            Ember.run(function () {
                component.set('post.metaDescription', 'a different description');

                expect(component.get('metaDescriptionScratch')).to.equal('a different description');
            });

            Ember.run(function () {
                component.set('metaDescriptionScratch', 'changed directly');

                expect(component.get('post.metaDescription')).to.equal('a different description');
                expect(component.get('metaDescriptionScratch')).to.equal('changed directly');
            });

            Ember.run(function () {
                // test that the one-way binding is still in place
                component.set('post.metaDescription', 'should update');

                expect(component.get('metaDescriptionScratch')).to.equal('should update');
            });
        });

        (0, _mocha.describe)('seoTitle', function () {
            (0, _mocha.it)('should be the metaTitle if one exists', function () {
                let component = this.subject({
                    post: Ember.Object.extend({
                        titleScratch: 'should not be used',
                        metaTitle: 'a meta-title',
                        metaTitleScratch: (0, _boundOneWay.default)('metaTitle')
                    }).create()
                });

                expect(component.get('seoTitle')).to.equal('a meta-title');
            });

            (0, _mocha.it)('should default to the title if an explicit meta-title does not exist', function () {
                let component = this.subject({
                    post: Ember.Object.create({
                        titleScratch: 'should be the meta-title'
                    })
                });

                expect(component.get('seoTitle')).to.equal('should be the meta-title');
            });

            (0, _mocha.it)('should be the metaTitle if both title and metaTitle exist', function () {
                let component = this.subject({
                    post: Ember.Object.extend({
                        titleScratch: 'a title',
                        metaTitle: 'a meta-title',
                        metaTitleScratch: (0, _boundOneWay.default)('metaTitle')
                    }).create()
                });

                expect(component.get('seoTitle')).to.equal('a meta-title');
            });

            (0, _mocha.it)('should revert to the title if explicit metaTitle is removed', function () {
                let component = this.subject({
                    post: Ember.Object.extend({
                        titleScratch: 'a title',
                        metaTitle: 'a meta-title',
                        metaTitleScratch: (0, _boundOneWay.default)('metaTitle')
                    }).create()
                });

                expect(component.get('seoTitle')).to.equal('a meta-title');

                Ember.run(function () {
                    component.set('post.metaTitle', '');

                    expect(component.get('seoTitle')).to.equal('a title');
                });
            });

            (0, _mocha.it)('should truncate to 70 characters with an appended ellipsis', function () {
                let longTitle = new Array(100).join('a');
                let component = this.subject({
                    post: Ember.Object.create()
                });

                expect(longTitle.length).to.equal(99);

                Ember.run(function () {
                    let expected = `${longTitle.substr(0, 70)}&hellip;`;

                    component.set('metaTitleScratch', longTitle);

                    expect(component.get('seoTitle').toString().length).to.equal(78);
                    expect(component.get('seoTitle').toString()).to.equal(expected);
                });
            });
        });

        (0, _mocha.describe)('seoDescription', function () {
            (0, _mocha.it)('should be the metaDescription if one exists', function () {
                let component = this.subject({
                    post: Ember.Object.extend({
                        metaDescription: 'a description',
                        metaDescriptionScratch: (0, _boundOneWay.default)('metaDescription')
                    }).create()
                });

                expect(component.get('seoDescription')).to.equal('a description');
            });

            (0, _mocha.it)('should be generated from the rendered mobiledoc if not explicitly set', function () {
                let component = this.subject({
                    post: Ember.Object.extend({
                        metaDescription: null,
                        metaDescriptionScratch: (0, _boundOneWay.default)('metaDescription'),
                        author: Ember.RSVP.resolve(),

                        init() {
                            this._super(...arguments);
                            this.scratch = {
                                cards: [['markdown-card', {
                                    markdown: '# This is a <strong>test</strong> <script>foo</script>'
                                }]]
                            };
                        }
                    }).create()
                });

                expect(component.get('seoDescription')).to.equal('This is a test');
            });

            (0, _mocha.it)('should truncate to 156 characters with an appended ellipsis', function () {
                let longDescription = new Array(200).join('a');
                let component = this.subject({
                    post: Ember.Object.create()
                });

                expect(longDescription.length).to.equal(199);

                Ember.run(function () {
                    let expected = `${longDescription.substr(0, 156)}&hellip;`;

                    component.set('metaDescriptionScratch', longDescription);

                    expect(component.get('seoDescription').toString().length).to.equal(164);
                    expect(component.get('seoDescription').toString()).to.equal(expected);
                });
            });
        });

        (0, _mocha.describe)('seoURL', function () {
            (0, _mocha.it)('should be the URL of the blog if no post slug exists', function () {
                let component = this.subject({
                    config: Ember.Object.create({ blogUrl: 'http://my-ghost-blog.com' }),
                    post: Ember.Object.create()
                });

                expect(component.get('seoURL')).to.equal('http://my-ghost-blog.com/');
            });

            (0, _mocha.it)('should be the URL of the blog plus the post slug', function () {
                let component = this.subject({
                    config: Ember.Object.create({ blogUrl: 'http://my-ghost-blog.com' }),
                    post: Ember.Object.create({ slug: 'post-slug' })
                });

                expect(component.get('seoURL')).to.equal('http://my-ghost-blog.com/post-slug/');
            });

            (0, _mocha.it)('should update when the post slug changes', function () {
                let component = this.subject({
                    config: Ember.Object.create({ blogUrl: 'http://my-ghost-blog.com' }),
                    post: Ember.Object.create({ slug: 'post-slug' })
                });

                expect(component.get('seoURL')).to.equal('http://my-ghost-blog.com/post-slug/');

                Ember.run(function () {
                    component.set('post.slug', 'changed-slug');

                    expect(component.get('seoURL')).to.equal('http://my-ghost-blog.com/changed-slug/');
                });
            });

            (0, _mocha.it)('should truncate a long URL to 70 characters with an appended ellipsis', function () {
                let blogURL = 'http://my-ghost-blog.com';
                let longSlug = new Array(75).join('a');
                let component = this.subject({
                    config: Ember.Object.create({ blogUrl: blogURL }),
                    post: Ember.Object.create({ slug: longSlug })
                });
                let expected;

                expect(longSlug.length).to.equal(74);

                expected = `${blogURL}/${longSlug}/`;
                expected = `${expected.substr(0, 70)}&hellip;`;

                expect(component.get('seoURL').toString().length).to.equal(78);
                expect(component.get('seoURL').toString()).to.equal(expected);
            });
        });

        (0, _mocha.describe)('togglePage', function () {
            (0, _mocha.it)('should toggle the page property', function () {
                let component = this.subject({
                    post: Ember.Object.create({
                        page: false,
                        isNew: true
                    })
                });

                expect(component.get('post.page')).to.not.be.ok;

                Ember.run(function () {
                    component.send('togglePage');

                    expect(component.get('post.page')).to.be.ok;
                });
            });

            (0, _mocha.it)('should not save the post if it is still new', function () {
                let component = this.subject({
                    post: Ember.Object.create({
                        page: false,
                        isNew: true,
                        save() {
                            this.incrementProperty('saved');
                            return Ember.RSVP.resolve();
                        }
                    })
                });

                Ember.run(function () {
                    component.send('togglePage');

                    expect(component.get('post.page')).to.be.ok;
                    expect(component.get('post.saved')).to.not.be.ok;
                });
            });

            (0, _mocha.it)('should save the post if it is not new', function () {
                let component = this.subject({
                    post: Ember.Object.create({
                        page: false,
                        isNew: false,
                        save() {
                            this.incrementProperty('saved');
                            return Ember.RSVP.resolve();
                        }
                    })
                });

                Ember.run(function () {
                    component.send('togglePage');

                    expect(component.get('post.page')).to.be.ok;
                    expect(component.get('post.saved')).to.equal(1);
                });
            });
        });

        (0, _mocha.describe)('toggleFeatured', function () {
            (0, _mocha.it)('should toggle the featured property', function () {
                let component = this.subject({
                    post: Ember.Object.create({
                        featured: false,
                        isNew: true
                    })
                });

                Ember.run(function () {
                    component.send('toggleFeatured');

                    expect(component.get('post.featured')).to.be.ok;
                });
            });

            (0, _mocha.it)('should not save the post if it is still new', function () {
                let component = this.subject({
                    post: Ember.Object.create({
                        featured: false,
                        isNew: true,
                        save() {
                            this.incrementProperty('saved');
                            return Ember.RSVP.resolve();
                        }
                    })
                });

                Ember.run(function () {
                    component.send('toggleFeatured');

                    expect(component.get('post.featured')).to.be.ok;
                    expect(component.get('post.saved')).to.not.be.ok;
                });
            });

            (0, _mocha.it)('should save the post if it is not new', function () {
                let component = this.subject({
                    post: Ember.Object.create({
                        featured: false,
                        isNew: false,
                        save() {
                            this.incrementProperty('saved');
                            return Ember.RSVP.resolve();
                        }
                    })
                });

                Ember.run(function () {
                    component.send('toggleFeatured');

                    expect(component.get('post.featured')).to.be.ok;
                    expect(component.get('post.saved')).to.equal(1);
                });
            });
        });

        (0, _mocha.describe)('updateSlug', function () {
            (0, _mocha.it)('should reset slugValue to the previous slug when the new slug is blank or unchanged', function () {
                let component = this.subject({
                    post: Ember.Object.create({
                        slug: 'slug'
                    })
                });

                Ember.run(function () {
                    // unchanged
                    component.set('slugValue', 'slug');
                    component.send('updateSlug', component.get('slugValue'));

                    expect(component.get('post.slug')).to.equal('slug');
                    expect(component.get('slugValue')).to.equal('slug');
                });

                Ember.run(function () {
                    // unchanged after trim
                    component.set('slugValue', 'slug  ');
                    component.send('updateSlug', component.get('slugValue'));

                    expect(component.get('post.slug')).to.equal('slug');
                    expect(component.get('slugValue')).to.equal('slug');
                });

                Ember.run(function () {
                    // blank
                    component.set('slugValue', '');
                    component.send('updateSlug', component.get('slugValue'));

                    expect(component.get('post.slug')).to.equal('slug');
                    expect(component.get('slugValue')).to.equal('slug');
                });
            });

            (0, _mocha.it)('should not set a new slug if the server-generated slug matches existing slug', function (done) {
                let component = this.subject({
                    slugGenerator: Ember.Object.create({
                        generateSlug(slugType, str) {
                            let promise = Ember.RSVP.resolve(str.split('#')[0]);
                            this.set('lastPromise', promise);
                            return promise;
                        }
                    }),
                    post: Ember.Object.create({
                        slug: 'whatever'
                    })
                });

                Ember.run(function () {
                    component.set('slugValue', 'whatever#slug');
                    component.send('updateSlug', component.get('slugValue'));

                    Ember.RSVP.resolve(component.get('lastPromise')).then(function () {
                        expect(component.get('post.slug')).to.equal('whatever');

                        done();
                    }).catch(done);
                });
            });

            (0, _mocha.it)('should not set a new slug if the only change is to the appended increment value', function (done) {
                let component = this.subject({
                    slugGenerator: Ember.Object.create({
                        generateSlug(slugType, str) {
                            let sanitizedStr = str.replace(/[^a-zA-Z]/g, '');
                            let promise = Ember.RSVP.resolve(`${sanitizedStr}-2`);
                            this.set('lastPromise', promise);
                            return promise;
                        }
                    }),
                    post: Ember.Object.create({
                        slug: 'whatever'
                    })
                });

                Ember.run(function () {
                    component.set('slugValue', 'whatever!');
                    component.send('updateSlug', component.get('slugValue'));

                    Ember.RSVP.resolve(component.get('lastPromise')).then(function () {
                        expect(component.get('post.slug')).to.equal('whatever');

                        done();
                    }).catch(done);
                });
            });

            (0, _mocha.it)('should set the slug if the new slug is different', function (done) {
                let component = this.subject({
                    slugGenerator: Ember.Object.create({
                        generateSlug(slugType, str) {
                            let promise = Ember.RSVP.resolve(str);
                            this.set('lastPromise', promise);
                            return promise;
                        }
                    }),
                    post: Ember.Object.create({
                        slug: 'whatever',
                        save: K
                    })
                });

                Ember.run(function () {
                    component.set('slugValue', 'changed');
                    component.send('updateSlug', component.get('slugValue'));

                    Ember.RSVP.resolve(component.get('lastPromise')).then(function () {
                        expect(component.get('post.slug')).to.equal('changed');

                        done();
                    }).catch(done);
                });
            });

            (0, _mocha.it)('should save the post when the slug changes and the post is not new', function (done) {
                let component = this.subject({
                    slugGenerator: Ember.Object.create({
                        generateSlug(slugType, str) {
                            let promise = Ember.RSVP.resolve(str);
                            this.set('lastPromise', promise);
                            return promise;
                        }
                    }),
                    post: Ember.Object.create({
                        slug: 'whatever',
                        saved: 0,
                        isNew: false,
                        save() {
                            this.incrementProperty('saved');
                        }
                    })
                });

                Ember.run(function () {
                    component.set('slugValue', 'changed');
                    component.send('updateSlug', component.get('slugValue'));

                    Ember.RSVP.resolve(component.get('lastPromise')).then(function () {
                        expect(component.get('post.slug')).to.equal('changed');
                        expect(component.get('post.saved')).to.equal(1);

                        done();
                    }).catch(done);
                });
            });

            (0, _mocha.it)('should not save the post when the slug changes and the post is new', function (done) {
                let component = this.subject({
                    slugGenerator: Ember.Object.create({
                        generateSlug(slugType, str) {
                            let promise = Ember.RSVP.resolve(str);
                            this.set('lastPromise', promise);
                            return promise;
                        }
                    }),
                    post: Ember.Object.create({
                        slug: 'whatever',
                        saved: 0,
                        isNew: true,
                        save() {
                            this.incrementProperty('saved');
                        }
                    })
                });

                Ember.run(function () {
                    component.set('slugValue', 'changed');
                    component.send('updateSlug', component.get('slugValue'));

                    Ember.RSVP.resolve(component.get('lastPromise')).then(function () {
                        expect(component.get('post.slug')).to.equal('changed');
                        expect(component.get('post.saved')).to.equal(0);

                        done();
                    }).catch(done);
                });
            });
        });
    });
});
define('ghost-admin/tests/unit/components/gh-url-preview-test', ['mocha', 'ember-mocha'], function (_mocha, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Component: gh-url-preview', function () {
        (0, _emberMocha.setupComponentTest)('gh-url-preview', {
            unit: true,
            needs: ['service:config']
        });

        (0, _mocha.it)('generates the correct preview URL with a prefix', function () {
            let component = this.subject({
                prefix: 'tag',
                slug: 'test-slug',
                tagName: 'p',
                classNames: 'test-class',

                config: { blogUrl: 'http://my-ghost-blog.com' }
            });

            this.render();

            expect(component.get('url')).to.equal('my-ghost-blog.com/tag/test-slug/');
        });

        (0, _mocha.it)('generates the correct preview URL without a prefix', function () {
            let component = this.subject({
                slug: 'test-slug',
                tagName: 'p',
                classNames: 'test-class',

                config: { blogUrl: 'http://my-ghost-blog.com' }
            });

            this.render();

            expect(component.get('url')).to.equal('my-ghost-blog.com/test-slug/');
        });
    });
});
define('ghost-admin/tests/unit/components/gh-user-active-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Component: gh-user-active', function () {
        (0, _emberMocha.setupComponentTest)('gh-user-active', {
            unit: true,
            // specify the other units that are required for this test
            needs: ['service:ghostPaths']
        });

        (0, _mocha.it)('renders', function () {
            // creates the component instance
            let component = this.subject();

            (0, _chai.expect)(component._state).to.equal('preRender');

            // renders the component on the page
            this.render();
            (0, _chai.expect)(component._state).to.equal('inDOM');
        });
    });
});
define('ghost-admin/tests/unit/components/gh-user-invited-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Component: gh-user-invited', function () {
        (0, _emberMocha.setupComponentTest)('gh-user-invited', {
            unit: true,
            // specify the other units that are required for this test
            needs: ['service:notifications']
        });

        (0, _mocha.it)('renders', function () {
            // creates the component instance
            let component = this.subject();

            (0, _chai.expect)(component._state).to.equal('preRender');

            // renders the component on the page
            this.render();
            (0, _chai.expect)(component._state).to.equal('inDOM');
        });
    });
});
define('ghost-admin/tests/unit/controllers/editor-test', ['ember-test-helpers/wait', 'mocha', 'chai', 'ember-mocha', 'ember-concurrency'], function (_wait, _mocha, _chai, _emberMocha, _emberConcurrency) {
    'use strict';

    (0, _mocha.describe)('Unit: Controller: editor', function () {
        (0, _emberMocha.setupTest)('controller:editor', {
            needs: ['controller:application', 'service:feature', 'service:notifications',
            // 'service:router',
            'service:slugGenerator', 'service:session', 'service:ui']
        });

        (0, _mocha.describe)('generateSlug', function () {
            (0, _mocha.it)('should generate a slug and set it on the post', function (done) {
                Ember.run(() => {
                    let controller = this.subject();

                    controller.set('slugGenerator', Ember.Object.create({
                        generateSlug(slugType, str) {
                            return Ember.RSVP.resolve(`${str}-slug`);
                        }
                    }));
                    controller.set('post', Ember.Object.create({ slug: '' }));

                    controller.set('post.titleScratch', 'title');

                    (0, _chai.expect)(controller.get('post.slug')).to.equal('');

                    Ember.run(() => {
                        controller.get('generateSlug').perform();
                    });

                    (0, _wait.default)().then(() => {
                        (0, _chai.expect)(controller.get('post.slug')).to.equal('title-slug');
                        done();
                    });
                });
            });

            (0, _mocha.it)('should not set the destination if the title is "(Untitled)" and the post already has a slug', function (done) {
                let controller = this.subject();

                Ember.run(() => {
                    controller.set('slugGenerator', Ember.Object.create({
                        generateSlug(slugType, str) {
                            return Ember.RSVP.resolve(`${str}-slug`);
                        }
                    }));
                    controller.set('post', Ember.Object.create({ slug: 'whatever' }));
                });

                (0, _chai.expect)(controller.get('post.slug')).to.equal('whatever');

                controller.set('post.titleScratch', '(Untitled)');

                Ember.run(() => {
                    controller.get('generateSlug').perform();
                });

                (0, _wait.default)().then(() => {
                    (0, _chai.expect)(controller.get('post.slug')).to.equal('whatever');
                    done();
                });
            });
        });

        (0, _mocha.describe)('saveTitle', function () {
            (0, _mocha.it)('should invoke generateSlug if the post is new and a title has not been set', function (done) {
                let controller = this.subject();

                Ember.run(() => {
                    controller.set('generateSlug', (0, _emberConcurrency.task)(function* () {
                        this.set('post.slug', 'test-slug');
                        yield Ember.RSVP.resolve();
                    }));
                    controller.set('post', Ember.Object.create({ isNew: true }));
                });

                (0, _chai.expect)(controller.get('post.isNew')).to.be.true;
                (0, _chai.expect)(controller.get('post.titleScratch')).to.not.be.ok;

                controller.set('post.titleScratch', 'test');

                Ember.run(() => {
                    controller.get('saveTitle').perform();
                });

                (0, _wait.default)().then(() => {
                    (0, _chai.expect)(controller.get('post.titleScratch')).to.equal('test');
                    (0, _chai.expect)(controller.get('post.slug')).to.equal('test-slug');
                    done();
                });
            });

            (0, _mocha.it)('should invoke generateSlug if the post is not new and it\'s title is "(Untitled)"', function (done) {
                let controller = this.subject();

                Ember.run(() => {
                    controller.set('generateSlug', (0, _emberConcurrency.task)(function* () {
                        this.set('post.slug', 'test-slug');
                        yield Ember.RSVP.resolve();
                    }));
                    controller.set('post', Ember.Object.create({ isNew: false, title: '(Untitled)' }));
                });

                (0, _chai.expect)(controller.get('post.isNew')).to.be.false;
                (0, _chai.expect)(controller.get('post.titleScratch')).to.not.be.ok;

                controller.set('post.titleScratch', 'New Title');

                Ember.run(() => {
                    controller.get('saveTitle').perform();
                });

                (0, _wait.default)().then(() => {
                    (0, _chai.expect)(controller.get('post.titleScratch')).to.equal('New Title');
                    (0, _chai.expect)(controller.get('post.slug')).to.equal('test-slug');
                    done();
                });
            });

            (0, _mocha.it)('should not invoke generateSlug if the post is new but has a title', function (done) {
                let controller = this.subject();

                Ember.run(() => {
                    controller.set('generateSlug', (0, _emberConcurrency.task)(function* () {
                        (0, _chai.expect)(false, 'generateSlug should not be called').to.equal(true);
                        yield Ember.RSVP.resolve();
                    }));
                    controller.set('post', Ember.Object.create({
                        isNew: true,
                        title: 'a title'
                    }));
                });

                (0, _chai.expect)(controller.get('post.isNew')).to.be.true;
                (0, _chai.expect)(controller.get('post.title')).to.equal('a title');
                (0, _chai.expect)(controller.get('post.titleScratch')).to.not.be.ok;

                controller.set('post.titleScratch', 'test');

                Ember.run(() => {
                    controller.get('saveTitle').perform();
                });

                (0, _wait.default)().then(() => {
                    (0, _chai.expect)(controller.get('post.titleScratch')).to.equal('test');
                    (0, _chai.expect)(controller.get('post.slug')).to.not.be.ok;
                    done();
                });
            });

            (0, _mocha.it)('should not invoke generateSlug if the post is not new and the title is not "(Untitled)"', function (done) {
                let controller = this.subject();

                Ember.run(() => {
                    controller.set('generateSlug', (0, _emberConcurrency.task)(function* () {
                        (0, _chai.expect)(false, 'generateSlug should not be called').to.equal(true);
                        yield Ember.RSVP.resolve();
                    }));
                    controller.set('post', Ember.Object.create({ isNew: false }));
                });

                (0, _chai.expect)(controller.get('post.isNew')).to.be.false;
                (0, _chai.expect)(controller.get('post.title')).to.not.be.ok;

                controller.set('post.titleScratch', 'title');

                Ember.run(() => {
                    controller.get('saveTitle').perform();
                });

                (0, _wait.default)().then(() => {
                    (0, _chai.expect)(controller.get('post.titleScratch')).to.equal('title');
                    (0, _chai.expect)(controller.get('post.slug')).to.not.be.ok;
                    done();
                });
            });
        });
    });
});
define('ghost-admin/tests/unit/controllers/settings/design-test', ['ghost-admin/models/navigation-item', 'chai', 'mocha', 'ember-mocha'], function (_navigationItem, _chai, _mocha, _emberMocha) {
    'use strict';

    // const navSettingJSON = `[
    //     {"label":"Home","url":"/"},
    //     {"label":"JS Test","url":"javascript:alert('hello');"},
    //     {"label":"About","url":"/about"},
    //     {"label":"Sub Folder","url":"/blah/blah"},
    //     {"label":"Telephone","url":"tel:01234-567890"},
    //     {"label":"Mailto","url":"mailto:test@example.com"},
    //     {"label":"External","url":"https://example.com/testing?query=test#anchor"},
    //     {"label":"No Protocol","url":"//example.com"}
    // ]`;

    (0, _mocha.describe)('Unit: Controller: settings/design', function () {
        (0, _emberMocha.setupTest)('controller:settings/design', {
            // Specify the other units that are required for this test.
            needs: ['model:navigation-item', 'service:ajax', 'service:config', 'service:ghostPaths', 'service:notifications', 'service:session', 'service:upgrade-status', 'service:settings']
        });

        (0, _mocha.it)('blogUrl: captures config and ensures trailing slash', function () {
            let ctrl = this.subject();
            ctrl.set('config.blogUrl', 'http://localhost:2368/blog');
            (0, _chai.expect)(ctrl.get('blogUrl')).to.equal('http://localhost:2368/blog/');
        });

        (0, _mocha.it)('init: creates a new navigation item', function () {
            let ctrl = this.subject();

            Ember.run(() => {
                (0, _chai.expect)(ctrl.get('newNavItem')).to.exist;
                (0, _chai.expect)(ctrl.get('newNavItem.isNew')).to.be.true;
            });
        });

        (0, _mocha.it)('blogUrl: captures config and ensures trailing slash', function () {
            let ctrl = this.subject();
            ctrl.set('config.blogUrl', 'http://localhost:2368/blog');
            (0, _chai.expect)(ctrl.get('blogUrl')).to.equal('http://localhost:2368/blog/');
        });

        (0, _mocha.it)('save: validates nav items', function (done) {
            let ctrl = this.subject();

            Ember.run(() => {
                ctrl.set('settings', Ember.Object.create({ navigation: [_navigationItem.default.create({ label: 'First', url: '/' }), _navigationItem.default.create({ label: '', url: '/second' }), _navigationItem.default.create({ label: 'Third', url: '' })] }));
                // blank item won't get added because the last item is incomplete
                (0, _chai.expect)(ctrl.get('settings.navigation.length')).to.equal(3);

                ctrl.get('save').perform().then(function passedValidation() {
                    (0, _chai.assert)(false, 'navigationItems weren\'t validated on save');
                    done();
                }).catch(function failedValidation() {
                    let navItems = ctrl.get('settings.navigation');
                    (0, _chai.expect)(navItems[0].get('errors').toArray()).to.be.empty;
                    (0, _chai.expect)(navItems[1].get('errors.firstObject.attribute')).to.equal('label');
                    (0, _chai.expect)(navItems[2].get('errors.firstObject.attribute')).to.equal('url');
                    done();
                });
            });
        });

        (0, _mocha.it)('save: ignores blank last item when saving', function (done) {
            let ctrl = this.subject();

            Ember.run(() => {
                ctrl.set('settings', Ember.Object.create({ navigation: [_navigationItem.default.create({ label: 'First', url: '/' }), _navigationItem.default.create({ label: '', url: '' })] }));

                (0, _chai.expect)(ctrl.get('settings.navigation.length')).to.equal(2);

                ctrl.get('save').perform().then(function passedValidation() {
                    (0, _chai.assert)(false, 'navigationItems weren\'t validated on save');
                    done();
                }).catch(function failedValidation() {
                    let navItems = ctrl.get('settings.navigation');
                    (0, _chai.expect)(navItems[0].get('errors').toArray()).to.be.empty;
                    done();
                });
            });
        });

        (0, _mocha.it)('action - addNavItem: adds item to navigationItems', function () {
            let ctrl = this.subject();

            Ember.run(() => {
                ctrl.set('settings', Ember.Object.create({ navigation: [_navigationItem.default.create({ label: 'First', url: '/first', last: true })] }));
            });

            (0, _chai.expect)(ctrl.get('settings.navigation.length')).to.equal(1);

            ctrl.set('newNavItem.label', 'New');
            ctrl.set('newNavItem.url', '/new');

            Ember.run(() => {
                ctrl.send('addNavItem');
            });

            (0, _chai.expect)(ctrl.get('settings.navigation.length')).to.equal(2);
            (0, _chai.expect)(ctrl.get('settings.navigation.lastObject.label')).to.equal('New');
            (0, _chai.expect)(ctrl.get('settings.navigation.lastObject.url')).to.equal('/new');
            (0, _chai.expect)(ctrl.get('settings.navigation.lastObject.isNew')).to.be.false;
            (0, _chai.expect)(ctrl.get('newNavItem.label')).to.be.empty;
            (0, _chai.expect)(ctrl.get('newNavItem.url')).to.be.empty;
            (0, _chai.expect)(ctrl.get('newNavItem.isNew')).to.be.true;
        });

        (0, _mocha.it)('action - addNavItem: doesn\'t insert new item if last object is incomplete', function () {
            let ctrl = this.subject();

            Ember.run(() => {
                ctrl.set('settings', Ember.Object.create({ navigation: [_navigationItem.default.create({ label: '', url: '', last: true })] }));
                (0, _chai.expect)(ctrl.get('settings.navigation.length')).to.equal(1);
                ctrl.send('addNavItem');
                (0, _chai.expect)(ctrl.get('settings.navigation.length')).to.equal(1);
            });
        });

        (0, _mocha.it)('action - deleteNavItem: removes item from navigationItems', function () {
            let ctrl = this.subject();
            let navItems = [_navigationItem.default.create({ label: 'First', url: '/first' }), _navigationItem.default.create({ label: 'Second', url: '/second', last: true })];

            Ember.run(() => {
                ctrl.set('settings', Ember.Object.create({ navigation: navItems }));
                (0, _chai.expect)(ctrl.get('settings.navigation').mapBy('label')).to.deep.equal(['First', 'Second']);
                ctrl.send('deleteNavItem', ctrl.get('settings.navigation.firstObject'));
                (0, _chai.expect)(ctrl.get('settings.navigation').mapBy('label')).to.deep.equal(['Second']);
            });
        });

        (0, _mocha.it)('action - updateUrl: updates URL on navigationItem', function () {
            let ctrl = this.subject();
            let navItems = [_navigationItem.default.create({ label: 'First', url: '/first' }), _navigationItem.default.create({ label: 'Second', url: '/second', last: true })];

            Ember.run(() => {
                ctrl.set('settings', Ember.Object.create({ navigation: navItems }));
                (0, _chai.expect)(ctrl.get('settings.navigation').mapBy('url')).to.deep.equal(['/first', '/second']);
                ctrl.send('updateUrl', '/new', ctrl.get('settings.navigation.firstObject'));
                (0, _chai.expect)(ctrl.get('settings.navigation').mapBy('url')).to.deep.equal(['/new', '/second']);
            });
        });
    });
});
define('ghost-admin/tests/unit/controllers/subscribers-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Controller: subscribers', function () {
        (0, _emberMocha.setupTest)('controller:subscribers', {
            needs: ['service:notifications', 'service:session']
        });

        // Replace this with your real tests.
        (0, _mocha.it)('exists', function () {
            let controller = this.subject();
            (0, _chai.expect)(controller).to.be.ok;
        });
    });
});
define('ghost-admin/tests/unit/helpers/gh-count-characters-test', ['ghost-admin/helpers/gh-count-characters', 'mocha', 'chai'], function (_ghCountCharacters, _mocha, _chai) {
    'use strict';

    (0, _mocha.describe)('Unit: Helper: gh-count-characters', function () {
        let defaultStyle = 'color: rgb(115, 138, 148);';
        let errorStyle = 'color: rgb(240, 82, 48);';

        (0, _mocha.it)('counts remaining chars', function () {
            let result = (0, _ghCountCharacters.countCharacters)(['test']);
            (0, _chai.expect)(result.string).to.equal(`<span class="word-count" style="${defaultStyle}">196</span>`);
        });

        (0, _mocha.it)('warns when nearing limit', function () {
            let result = (0, _ghCountCharacters.countCharacters)([Array(195 + 1).join('x')]);
            (0, _chai.expect)(result.string).to.equal(`<span class="word-count" style="${errorStyle}">5</span>`);
        });

        (0, _mocha.it)('indicates too many chars', function () {
            let result = (0, _ghCountCharacters.countCharacters)([Array(205 + 1).join('x')]);
            (0, _chai.expect)(result.string).to.equal(`<span class="word-count" style="${errorStyle}">-5</span>`);
        });

        (0, _mocha.it)('counts multibyte correctly', function () {
            let result = (0, _ghCountCharacters.countCharacters)(['💩']);
            (0, _chai.expect)(result.string).to.equal(`<span class="word-count" style="${defaultStyle}">199</span>`);

            // emoji + modifier is still two chars
            result = (0, _ghCountCharacters.countCharacters)(['💃🏻']);
            (0, _chai.expect)(result.string).to.equal(`<span class="word-count" style="${defaultStyle}">198</span>`);
        });
    });
});
define('ghost-admin/tests/unit/helpers/gh-count-down-characters-test', ['ghost-admin/helpers/gh-count-down-characters', 'mocha', 'chai'], function (_ghCountDownCharacters, _mocha, _chai) {
    'use strict';

    (0, _mocha.describe)('Unit: Helper: gh-count-down-characters', function () {
        let validStyle = 'color: rgb(159, 187, 88);';
        let errorStyle = 'color: rgb(226, 84, 64);';

        (0, _mocha.it)('counts chars', function () {
            let result = (0, _ghCountDownCharacters.countDownCharacters)(['test', 200]);
            (0, _chai.expect)(result.string).to.equal(`<span class="word-count" style="${validStyle}">4</span>`);
        });

        (0, _mocha.it)('warns with too many chars', function () {
            let result = (0, _ghCountDownCharacters.countDownCharacters)([Array(205 + 1).join('x'), 200]);
            (0, _chai.expect)(result.string).to.equal(`<span class="word-count" style="${errorStyle}">205</span>`);
        });

        (0, _mocha.it)('counts multibyte correctly', function () {
            let result = (0, _ghCountDownCharacters.countDownCharacters)(['💩', 200]);
            (0, _chai.expect)(result.string).to.equal(`<span class="word-count" style="${validStyle}">1</span>`);

            // emoji + modifier is still two chars
            result = (0, _ghCountDownCharacters.countDownCharacters)(['💃🏻', 200]);
            (0, _chai.expect)(result.string).to.equal(`<span class="word-count" style="${validStyle}">2</span>`);
        });
    });
});
define('ghost-admin/tests/unit/helpers/gh-format-post-time-test', ['moment', 'sinon', 'mocha', 'chai', 'ember-mocha'], function (_moment, _sinon, _mocha, _chai, _emberMocha) {
    'use strict';

    // because why not?
    const timezoneForTest = 'Iceland';

    (0, _mocha.describe)('Unit: Helper: gh-format-post-time', function () {
        (0, _emberMocha.setupTest)('helper:gh-format-post-time', {
            unit: true,
            needs: ['service:settings']
        });

        let sandbox = _sinon.default.sandbox.create();

        afterEach(function () {
            sandbox.restore();
        });

        function runFormatCheck(helper, date1, utc, options) {
            helper.set('settings', { activeTimezone: timezoneForTest });
            let mockDate = (0, _moment.default)(date1);
            // Compute this before we override utc
            let expectedTime = _moment.default.tz(mockDate, timezoneForTest).format('HH:mm');
            let utcStub = sandbox.stub(_moment.default, 'utc');
            utcStub.returns((0, _moment.default)(utc));
            utcStub.onFirstCall().returns(mockDate);

            let result = helper.compute([mockDate], options);
            return { expectedTime, result };
        }

        (0, _mocha.it)('returns basic time difference if post is draft', function () {
            let helper = this.subject();
            let mockDate = _moment.default.utc().subtract(1, 'hour');

            let result = helper.compute([mockDate], { draft: true });
            (0, _chai.expect)(result).to.equal('an hour ago');
        });

        (0, _mocha.it)('returns difference if post was published less than 15 minutes ago', function () {
            let helper = this.subject();
            let mockDate = _moment.default.utc().subtract(13, 'minutes');

            let result = helper.compute([mockDate], { published: true });
            (0, _chai.expect)(result).to.equal('13 minutes ago');
        });

        (0, _mocha.it)('returns difference if post is scheduled for less than 15 minutes from now', function () {
            let helper = this.subject();
            let mockDate = _moment.default.utc().add(13, 'minutes');

            let result = helper.compute([mockDate], { scheduled: true });
            (0, _chai.expect)(result).to.equal('in 13 minutes');
        });

        (0, _mocha.it)('returns correct format if post was published on the same day', function () {
            var _runFormatCheck = runFormatCheck(this.subject(), '2017-09-06T16:00:00Z', '2017-09-06T18:00:00Z', { published: true });

            let expectedTime = _runFormatCheck.expectedTime,
                result = _runFormatCheck.result;

            (0, _chai.expect)(result).to.equal(`${expectedTime} Today`);
        });

        (0, _mocha.it)('returns correct format if post is scheduled for the same day', function () {
            var _runFormatCheck2 = runFormatCheck(this.subject(), '2017-09-06T18:00:00Z', '2017-09-06T16:00:00Z', { scheduled: true });

            let expectedTime = _runFormatCheck2.expectedTime,
                result = _runFormatCheck2.result;

            (0, _chai.expect)(result).to.equal(`at ${expectedTime} Today`);
        });

        (0, _mocha.it)('returns correct format if post was published yesterday', function () {
            var _runFormatCheck3 = runFormatCheck(this.subject(), '2017-09-05T16:00:00Z', '2017-09-06T18:00:00Z', { published: true });

            let expectedTime = _runFormatCheck3.expectedTime,
                result = _runFormatCheck3.result;

            (0, _chai.expect)(result).to.equal(`${expectedTime} Yesterday`);
        });

        (0, _mocha.it)('returns correct format if post is scheduled for tomorrow', function () {
            var _runFormatCheck4 = runFormatCheck(this.subject(), '2017-09-07T18:00:00Z', '2017-09-06T16:00:00Z', { scheduled: true });

            let expectedTime = _runFormatCheck4.expectedTime,
                result = _runFormatCheck4.result;

            (0, _chai.expect)(result).to.equal(`at ${expectedTime} Tomorrow`);
        });

        (0, _mocha.it)('returns correct format if post was published prior to yesterday', function () {
            var _runFormatCheck5 = runFormatCheck(this.subject(), '2017-09-02T16:00:00Z', '2017-09-06T18:00:00Z', { published: true });

            let result = _runFormatCheck5.result;

            (0, _chai.expect)(result).to.equal('02 Sep 2017');
        });

        (0, _mocha.it)('returns correct format if post is scheduled for later than tomorrow', function () {
            var _runFormatCheck6 = runFormatCheck(this.subject(), '2017-09-10T18:00:00Z', '2017-09-06T16:00:00Z', { scheduled: true });

            let expectedTime = _runFormatCheck6.expectedTime,
                result = _runFormatCheck6.result;

            (0, _chai.expect)(result).to.equal(`at ${expectedTime} on 10 Sep 2017`);
        });
    });
});
define('ghost-admin/tests/unit/helpers/gh-user-can-admin-test', ['ghost-admin/helpers/gh-user-can-admin', 'mocha'], function (_ghUserCanAdmin, _mocha) {
    'use strict';

    describe('Unit: Helper: gh-user-can-admin', function () {
        // Mock up roles and test for truthy
        describe('Owner role', function () {
            let user = {
                get(role) {
                    if (role === 'isOwner') {
                        return true;
                    } else if (role === 'isAdmin') {
                        return false;
                    }
                }
            };

            (0, _mocha.it)(' - can be Admin', function () {
                let result = (0, _ghUserCanAdmin.ghUserCanAdmin)([user]);
                expect(result).to.equal(true);
            });
        });

        describe('Administrator role', function () {
            let user = {
                get(role) {
                    if (role === 'isOwner') {
                        return false;
                    } else if (role === 'isAdmin') {
                        return true;
                    }
                }
            };

            (0, _mocha.it)(' - can be Admin', function () {
                let result = (0, _ghUserCanAdmin.ghUserCanAdmin)([user]);
                expect(result).to.equal(true);
            });
        });

        describe('Editor, Author & Contributor roles', function () {
            let user = {
                get(role) {
                    if (role === 'isOwner') {
                        return false;
                    } else if (role === 'isAdmin') {
                        return false;
                    }
                }
            };

            (0, _mocha.it)(' - cannot be Admin', function () {
                let result = (0, _ghUserCanAdmin.ghUserCanAdmin)([user]);
                expect(result).to.equal(false);
            });
        });
    });
});
define('ghost-admin/tests/unit/helpers/highlighted-text-test', ['mocha', 'chai', 'ghost-admin/helpers/highlighted-text'], function (_mocha, _chai, _highlightedText) {
    'use strict';

    (0, _mocha.describe)('Unit: Helper: highlighted-text', function () {
        (0, _mocha.it)('works', function () {
            let result = (0, _highlightedText.highlightedText)(['Test', 'e']);
            (0, _chai.expect)(result).to.be.an('object');
            (0, _chai.expect)(result.string).to.equal('T<span class="highlight">e</span>st');
        });
    });
});
define('ghost-admin/tests/unit/helpers/is-equal-test', ['mocha', 'chai', 'ghost-admin/helpers/is-equal'], function (_mocha, _chai, _isEqual) {
    'use strict';

    (0, _mocha.describe)('Unit: Helper: is-equal', function () {
        // Replace this with your real tests.
        (0, _mocha.it)('works', function () {
            let result = (0, _isEqual.isEqual)([42, 42]);

            (0, _chai.expect)(result).to.be.ok;
        });
    });
});
define('ghost-admin/tests/unit/helpers/is-not-test', ['mocha', 'chai', 'ghost-admin/helpers/is-not'], function (_mocha, _chai, _isNot) {
    'use strict';

    (0, _mocha.describe)('Unit: Helper: is-not', function () {
        // Replace this with your real tests.
        (0, _mocha.it)('works', function () {
            let result = (0, _isNot.isNot)(false);

            (0, _chai.expect)(result).to.be.ok;
        });
    });
});
define('ghost-admin/tests/unit/mixins/validation-engine-test', ['mocha'], function (_mocha) {
    'use strict';

    // import EmberObject from 'ember-object';
    // import ValidationEngineMixin from 'ghost-admin/mixins/validation-engine';

    (0, _mocha.describe)('ValidationEngineMixin', function () {
        // Replace this with your real tests.
        // it('works', function () {
        //     var ValidationEngineObject = EmberObject.extend(ValidationEngineMixin);
        //     var subject = ValidationEngineObject.create();
        //     expect(subject).to.be.ok;
        // });

        (0, _mocha.describe)('#validate', function () {
            (0, _mocha.it)('loads the correct validator');
            (0, _mocha.it)('rejects if the validator doesn\'t exist');
            (0, _mocha.it)('resolves with valid object');
            (0, _mocha.it)('rejects with invalid object');
            (0, _mocha.it)('clears all existing errors');

            (0, _mocha.describe)('with a specified property', function () {
                (0, _mocha.it)('resolves with valid property');
                (0, _mocha.it)('rejects with invalid property');
                (0, _mocha.it)('adds property to hasValidated array');
                (0, _mocha.it)('clears existing error on specified property');
            });

            (0, _mocha.it)('handles a passed in model');
            (0, _mocha.it)('uses this.model if available');
        });

        (0, _mocha.describe)('#save', function () {
            (0, _mocha.it)('calls validate');
            (0, _mocha.it)('rejects with validation errors');
            (0, _mocha.it)('calls object\'s #save if validation passes');
            (0, _mocha.it)('skips validation if it\'s a deletion');
        });
    }); // import {expect} from 'chai';
});
define('ghost-admin/tests/unit/models/invite-test', ['pretender', 'mocha', 'chai', 'ember-mocha'], function (_pretender, _mocha, _chai, _emberMocha) {
    'use strict';

    var _slicedToArray = function () {
        function sliceIterator(arr, i) {
            var _arr = [];
            var _n = true;
            var _d = false;
            var _e = undefined;

            try {
                for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
                    _arr.push(_s.value);

                    if (i && _arr.length === i) break;
                }
            } catch (err) {
                _d = true;
                _e = err;
            } finally {
                try {
                    if (!_n && _i["return"]) _i["return"]();
                } finally {
                    if (_d) throw _e;
                }
            }

            return _arr;
        }

        return function (arr, i) {
            if (Array.isArray(arr)) {
                return arr;
            } else if (Symbol.iterator in Object(arr)) {
                return sliceIterator(arr, i);
            } else {
                throw new TypeError("Invalid attempt to destructure non-iterable instance");
            }
        };
    }();

    (0, _mocha.describe)('Unit: Model: invite', function () {
        (0, _emberMocha.setupModelTest)('invite', {
            needs: ['model:role', 'serializer:application', 'serializer:invite', 'transform:moment-utc', 'service:ghost-paths', 'service:ajax', 'service:session', 'service:feature', 'service:tour']
        });

        (0, _mocha.describe)('with network', function () {
            let server;

            beforeEach(function () {
                server = new _pretender.default();
            });

            afterEach(function () {
                server.shutdown();
            });

            (0, _mocha.it)('resend hits correct endpoint', function () {
                let model = this.subject();
                let role;

                server.post('/ghost/api/v0.1/invites/', function () {
                    return [200, {}, '{}'];
                });

                Ember.run(() => {
                    role = this.store().push({ data: { id: 1, type: 'role', attributes: { name: 'Editor' } } });
                    model.set('email', 'resend-test@example.com');
                    model.set('role', role);
                    model.resend();
                });

                (0, _chai.expect)(server.handledRequests.length, 'number of requests').to.equal(1);

                var _server$handledReques = _slicedToArray(server.handledRequests, 1);

                let lastRequest = _server$handledReques[0];

                let requestBody = JSON.parse(lastRequest.requestBody);

                var _requestBody$invites = _slicedToArray(requestBody.invites, 1);

                let invite = _requestBody$invites[0];


                (0, _chai.expect)(requestBody.invites.length, 'number of invites in request body').to.equal(1);

                (0, _chai.expect)(invite.email).to.equal('resend-test@example.com');
                // eslint-disable-next-line camelcase
                (0, _chai.expect)(invite.role_id, 'role ID').to.equal('1');
            });
        });
    });
});
define('ghost-admin/tests/unit/models/navigation-item-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Model: navigation-item', function () {
        (0, _emberMocha.setupTest)('model:navigation-item', {
            // Specify the other units that are required for this test.
            needs: []
        });

        (0, _mocha.it)('isComplete is true when label and url are filled', function () {
            let model = this.subject();

            model.set('label', 'test');
            model.set('url', 'test');

            (0, _chai.expect)(model.get('isComplete')).to.be.true;
        });

        (0, _mocha.it)('isComplete is false when label is blank', function () {
            let model = this.subject();

            model.set('label', '');
            model.set('url', 'test');

            (0, _chai.expect)(model.get('isComplete')).to.be.false;
        });

        (0, _mocha.it)('isComplete is false when url is blank', function () {
            let model = this.subject();

            model.set('label', 'test');
            model.set('url', '');

            (0, _chai.expect)(model.get('isComplete')).to.be.false;
        });

        (0, _mocha.it)('isBlank is true when label and url are blank', function () {
            let model = this.subject();

            model.set('label', '');
            model.set('url', '');

            (0, _chai.expect)(model.get('isBlank')).to.be.true;
        });

        (0, _mocha.it)('isBlank is false when label is present', function () {
            let model = this.subject();

            model.set('label', 'test');
            model.set('url', '');

            (0, _chai.expect)(model.get('isBlank')).to.be.false;
        });

        (0, _mocha.it)('isBlank is false when url is present', function () {
            let model = this.subject();

            model.set('label', '');
            model.set('url', 'test');

            (0, _chai.expect)(model.get('isBlank')).to.be.false;
        });
    });
});
define('ghost-admin/tests/unit/models/post-test', ['mocha', 'ember-mocha'], function (_mocha, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Model: post', function () {
        (0, _emberMocha.setupModelTest)('post', {
            needs: ['model:user', 'model:tag', 'model:role', 'service:ajax', 'service:clock', 'service:config', 'service:feature', 'service:ghostPaths', 'service:lazyLoader', 'service:notifications', 'service:session', 'service:settings']
        });

        (0, _mocha.it)('has a validation type of "post"', function () {
            let model = this.subject();

            expect(model.validationType).to.equal('post');
        });

        (0, _mocha.it)('isPublished, isDraft and isScheduled are correct', function () {
            let model = this.subject({
                status: 'published'
            });

            expect(model.get('isPublished')).to.be.ok;
            expect(model.get('isDraft')).to.not.be.ok;
            expect(model.get('isScheduled')).to.not.be.ok;

            Ember.run(function () {
                model.set('status', 'draft');

                expect(model.get('isPublished')).to.not.be.ok;
                expect(model.get('isDraft')).to.be.ok;
                expect(model.get('isScheduled')).to.not.be.ok;
            });

            Ember.run(function () {
                model.set('status', 'scheduled');

                expect(model.get('isScheduled')).to.be.ok;
                expect(model.get('isPublished')).to.not.be.ok;
                expect(model.get('isDraft')).to.not.be.ok;
            });
        });

        (0, _mocha.it)('isAuthoredByUser is correct', function () {
            let user1 = this.store().createRecord('user', { id: 'abcd1234' });
            let user2 = this.store().createRecord('user', { id: 'wxyz9876' });

            let model = this.subject({
                authors: [user1]
            });

            expect(model.isAuthoredByUser(user1)).to.be.ok;

            Ember.run(function () {
                model.set('authors', [user2]);

                expect(model.isAuthoredByUser(user1)).to.not.be.ok;
            });
        });

        (0, _mocha.it)('updateTags removes and deletes old tags', function () {
            let model = this.subject();

            Ember.run(this, function () {
                let modelTags = model.get('tags');
                let tag1 = this.store().createRecord('tag', { id: '1' });
                let tag2 = this.store().createRecord('tag', { id: '2' });
                let tag3 = this.store().createRecord('tag');

                // During testing a record created without an explicit id will get
                // an id of 'fixture-n' instead of null
                tag3.set('id', null);

                modelTags.pushObject(tag1);
                modelTags.pushObject(tag2);
                modelTags.pushObject(tag3);

                expect(model.get('tags.length')).to.equal(3);

                model.updateTags();

                expect(model.get('tags.length')).to.equal(2);
                expect(model.get('tags.firstObject.id')).to.equal('1');
                expect(model.get('tags').objectAt(1).get('id')).to.equal('2');
                expect(tag1.get('isDeleted')).to.not.be.ok;
                expect(tag2.get('isDeleted')).to.not.be.ok;
                expect(tag3.get('isDeleted')).to.be.ok;
            });
        });
    });
});
define('ghost-admin/tests/unit/models/role-test', ['mocha', 'ember-mocha'], function (_mocha, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Model: role', function () {
        (0, _emberMocha.setupModelTest)('role', {
            needs: ['service:ajax']
        });

        (0, _mocha.it)('provides a lowercase version of the name', function () {
            let model = this.subject({
                name: 'Author'
            });

            expect(model.get('name')).to.equal('Author');
            expect(model.get('lowerCaseName')).to.equal('author');

            Ember.run(function () {
                model.set('name', 'Editor');

                expect(model.get('name')).to.equal('Editor');
                expect(model.get('lowerCaseName')).to.equal('editor');
            });
        });
    });
});
define('ghost-admin/tests/unit/models/setting-test', ['mocha', 'ember-mocha'], function (_mocha, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Model: setting', function () {
        (0, _emberMocha.setupModelTest)('setting');
        (0, _mocha.it)('has a validation type of "setting"', function () {
            let model = this.subject();

            expect(model.get('validationType')).to.equal('setting');
        });
    });
});
define('ghost-admin/tests/unit/models/subscriber-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Model: subscriber', function () {
        (0, _emberMocha.setupModelTest)('subscriber', {
            // Specify the other units that are required for this test.
            needs: ['model:post', 'service:session']
        });

        // Replace this with your real tests.
        (0, _mocha.it)('exists', function () {
            let model = this.subject();
            // var store = this.store();
            (0, _chai.expect)(model).to.be.ok;
        });
    });
});
define('ghost-admin/tests/unit/models/tag-test', ['mocha', 'ember-mocha'], function (_mocha, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Model: tag', function () {
        (0, _emberMocha.setupModelTest)('tag', {
            needs: ['service:feature']
        });

        (0, _mocha.it)('has a validation type of "tag"', function () {
            let model = this.subject();

            expect(model.get('validationType')).to.equal('tag');
        });
    });
});
define('ghost-admin/tests/unit/models/user-test', ['mocha', 'ember-mocha'], function (_mocha, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Model: user', function () {
        (0, _emberMocha.setupModelTest)('user', {
            needs: ['model:role', 'serializer:application', 'serializer:user', 'service:ajax', 'service:config', 'service:ghostPaths', 'service:notifications', 'service:session']
        });

        (0, _mocha.it)('has a validation type of "user"', function () {
            let model = this.subject();

            expect(model.get('validationType')).to.equal('user');
        });

        (0, _mocha.it)('isActive/isSuspended properties are correct', function () {
            let model = this.subject({
                status: 'active'
            });

            expect(model.get('isActive')).to.be.ok;
            expect(model.get('isSuspended')).to.not.be.ok;

            ['warn-1', 'warn-2', 'warn-3', 'warn-4', 'locked'].forEach(function (status) {
                Ember.run(() => {
                    model.set('status', status);
                });
                expect(model.get('isActive')).to.be.ok;
                expect(model.get('isSuspended')).to.not.be.ok;
            });

            Ember.run(() => {
                model.set('status', 'inactive');
            });
            expect(model.get('isSuspended')).to.be.ok;
            expect(model.get('isActive')).to.not.be.ok;
        });

        (0, _mocha.it)('role property is correct', function () {
            let model = this.subject();

            Ember.run(() => {
                let role = this.store().push({ data: { id: 1, type: 'role', attributes: { name: 'Author' } } });
                model.get('roles').pushObject(role);
            });
            expect(model.get('role.name')).to.equal('Author');

            Ember.run(() => {
                let role = this.store().push({ data: { id: 1, type: 'role', attributes: { name: 'Editor' } } });
                model.set('role', role);
            });
            expect(model.get('role.name')).to.equal('Editor');
        });

        (0, _mocha.it)('isContributor property is correct', function () {
            let model = this.subject();

            Ember.run(() => {
                let role = this.store().push({ data: { id: 1, type: 'role', attributes: { name: 'Contributor' } } });
                model.set('role', role);
            });
            expect(model.get('isContributor')).to.be.ok;
            expect(model.get('isAuthorOrContributor')).to.be.ok;
            expect(model.get('isAuthor')).to.not.be.ok;
            expect(model.get('isEditor')).to.not.be.ok;
            expect(model.get('isAdmin')).to.not.be.ok;
            expect(model.get('isOwner')).to.not.be.ok;
        });

        (0, _mocha.it)('isAuthor property is correct', function () {
            let model = this.subject();

            Ember.run(() => {
                let role = this.store().push({ data: { id: 1, type: 'role', attributes: { name: 'Author' } } });
                model.set('role', role);
            });
            expect(model.get('isAuthor')).to.be.ok;
            expect(model.get('isContributor')).to.not.be.ok;
            expect(model.get('isAuthorOrContributor')).to.be.ok;
            expect(model.get('isEditor')).to.not.be.ok;
            expect(model.get('isAdmin')).to.not.be.ok;
            expect(model.get('isOwner')).to.not.be.ok;
        });

        (0, _mocha.it)('isEditor property is correct', function () {
            let model = this.subject();

            Ember.run(() => {
                let role = this.store().push({ data: { id: 1, type: 'role', attributes: { name: 'Editor' } } });
                model.set('role', role);
            });
            expect(model.get('isEditor')).to.be.ok;
            expect(model.get('isAuthor')).to.not.be.ok;
            expect(model.get('isContributor')).to.not.be.ok;
            expect(model.get('isAuthorOrContributor')).to.not.be.ok;
            expect(model.get('isAdmin')).to.not.be.ok;
            expect(model.get('isOwner')).to.not.be.ok;
        });

        (0, _mocha.it)('isAdmin property is correct', function () {
            let model = this.subject();

            Ember.run(() => {
                let role = this.store().push({ data: { id: 1, type: 'role', attributes: { name: 'Administrator' } } });
                model.set('role', role);
            });
            expect(model.get('isAdmin')).to.be.ok;
            expect(model.get('isAuthor')).to.not.be.ok;
            expect(model.get('isContributor')).to.not.be.ok;
            expect(model.get('isAuthorOrContributor')).to.not.be.ok;
            expect(model.get('isEditor')).to.not.be.ok;
            expect(model.get('isOwner')).to.not.be.ok;
        });

        (0, _mocha.it)('isOwner property is correct', function () {
            let model = this.subject();

            Ember.run(() => {
                let role = this.store().push({ data: { id: 1, type: 'role', attributes: { name: 'Owner' } } });
                model.set('role', role);
            });
            expect(model.get('isOwner')).to.be.ok;
            expect(model.get('isAuthor')).to.not.be.ok;
            expect(model.get('isContributor')).to.not.be.ok;
            expect(model.get('isAuthorOrContributor')).to.not.be.ok;
            expect(model.get('isAdmin')).to.not.be.ok;
            expect(model.get('isEditor')).to.not.be.ok;
        });
    });
});
define('ghost-admin/tests/unit/routes/subscribers-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Route: subscribers', function () {
        (0, _emberMocha.setupTest)('route:subscribers', {
            needs: ['service:feature', 'service:notifications', 'service:session']
        });

        (0, _mocha.it)('exists', function () {
            let route = this.subject();
            (0, _chai.expect)(route).to.be.ok;
        });
    });
});
define('ghost-admin/tests/unit/routes/subscribers/import-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Route: subscribers/import', function () {
        (0, _emberMocha.setupTest)('route:subscribers/import', {
            // Specify the other units that are required for this test.
            needs: ['service:notifications']
        });

        (0, _mocha.it)('exists', function () {
            let route = this.subject();
            (0, _chai.expect)(route).to.be.ok;
        });
    });
});
define('ghost-admin/tests/unit/routes/subscribers/new-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Route: subscribers/new', function () {
        (0, _emberMocha.setupTest)('route:subscribers/new', {
            needs: ['service:notifications']
        });

        (0, _mocha.it)('exists', function () {
            let route = this.subject();
            (0, _chai.expect)(route).to.be.ok;
        });
    });
});
define('ghost-admin/tests/unit/serializers/notification-test', ['pretender', 'mocha', 'chai', 'ember-mocha'], function (_pretender, _mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Serializer: notification', function () {
        (0, _emberMocha.setupModelTest)('notification', {
            // Specify the other units that are required for this test.
            needs: ['serializer:notification']
        });

        let server;

        beforeEach(function () {
            server = new _pretender.default();
        });

        afterEach(function () {
            server.shutdown();
        });

        (0, _mocha.it)('converts location->key when deserializing', function () {
            server.get('/notifications', function () {
                let response = {
                    notifications: [{
                        id: 1,
                        dismissible: false,
                        status: 'alert',
                        type: 'info',
                        location: 'test.foo',
                        message: 'This is a test'
                    }]
                };

                return [200, { 'Content-Type': 'application/json' }, JSON.stringify(response)];
            });

            return this.store().findAll('notification').then(notifications => {
                (0, _chai.expect)(notifications.get('length')).to.equal(1);
                (0, _chai.expect)(notifications.get('firstObject.key')).to.equal('test.foo');
            });
        });
    });
});
define('ghost-admin/tests/unit/serializers/post-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Serializer: post', function () {
        (0, _emberMocha.setupModelTest)('post', {
            // Specify the other units that are required for this test.
            needs: ['transform:moment-utc', 'transform:json-string', 'model:user', 'model:tag', 'service:ajax', 'service:clock', 'service:config', 'service:feature', 'service:ghostPaths', 'service:lazyLoader', 'service:notifications', 'service:session', 'service:settings']
        });

        // Replace this with your real tests.
        (0, _mocha.it)('serializes records', function () {
            let record = this.subject();

            let serializedRecord = record.serialize();

            (0, _chai.expect)(serializedRecord).to.be.ok;
        });
    });
});
define('ghost-admin/tests/unit/serializers/role-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit:Serializer: role', function () {
        (0, _emberMocha.setupModelTest)('role', {
            // Specify the other units that are required for this test.
            needs: ['transform:moment-utc']
        });

        // Replace this with your real tests.
        (0, _mocha.it)('serializes records', function () {
            let record = this.subject();

            let serializedRecord = record.serialize();

            (0, _chai.expect)(serializedRecord).to.be.ok;
        });
    });
});
define('ghost-admin/tests/unit/serializers/setting-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit:Serializer: setting', function () {
        (0, _emberMocha.setupModelTest)('setting', {
            // Specify the other units that are required for this test.
            needs: ['transform:moment-utc', 'transform:facebook-url-user', 'transform:twitter-url-user', 'transform:navigation-settings', 'transform:slack-settings', 'transform:unsplash-settings']
        });

        // Replace this with your real tests.
        (0, _mocha.it)('serializes records', function () {
            let record = this.subject();

            let serializedRecord = record.serialize();

            (0, _chai.expect)(serializedRecord).to.be.ok;
        });
    });
});
define('ghost-admin/tests/unit/serializers/subscriber-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit:Serializer: subscriber', function () {
        (0, _emberMocha.setupModelTest)('subscriber', {
            // Specify the other units that are required for this test.
            needs: ['model:post', 'transform:moment-utc']
        });

        // Replace this with your real tests.
        (0, _mocha.it)('serializes records', function () {
            let record = this.subject();

            let serializedRecord = record.serialize();

            (0, _chai.expect)(serializedRecord).to.be.ok;
        });
    });
});
define('ghost-admin/tests/unit/serializers/tag-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Serializer: tag', function () {
        (0, _emberMocha.setupModelTest)('tag', {
            // Specify the other units that are required for this test.
            needs: ['service:feature', 'transform:moment-utc', 'transform:raw']
        });

        // Replace this with your real tests.
        (0, _mocha.it)('serializes records', function () {
            let record = this.subject();

            let serializedRecord = record.serialize();

            (0, _chai.expect)(serializedRecord).to.be.ok;
        });
    });
});
define('ghost-admin/tests/unit/serializers/user-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Serializer: user', function () {
        (0, _emberMocha.setupModelTest)('user', {
            // Specify the other units that are required for this test.
            needs: ['model:role', 'service:ajax', 'service:config', 'service:ghostPaths', 'service:notifications', 'service:session', 'transform:facebook-url-user', 'transform:json-string', 'transform:moment-utc', 'transform:raw', 'transform:twitter-url-user']
        });

        // Replace this with your real tests.
        (0, _mocha.it)('serializes records', function () {
            let record = this.subject();

            let serializedRecord = record.serialize();

            (0, _chai.expect)(serializedRecord).to.be.ok;
        });
    });
});
define('ghost-admin/tests/unit/services/config-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Service: config', function () {
        (0, _emberMocha.setupTest)('service:config', {
            needs: ['service:ajax', 'service:ghostPaths']
        });

        // Replace this with your real tests.
        (0, _mocha.it)('exists', function () {
            let service = this.subject();
            (0, _chai.expect)(service).to.be.ok;
        });
    });
});
define('ghost-admin/tests/unit/services/event-bus-test', ['sinon', 'mocha', 'chai', 'ember-mocha'], function (_sinon, _mocha, _chai, _emberMocha) {
        'use strict';

        (0, _mocha.describe)('Unit: Service: event-bus', function () {
                (0, _emberMocha.setupTest)('service:event-bus', {});
                (0, _mocha.it)('works', function () {
                        let service = this.subject();
                        let eventHandler = _sinon.default.spy();

                        service.subscribe('test-event', eventHandler);

                        service.publish('test-event', 'test');

                        service.unsubscribe('test-event', eventHandler);

                        service.publish('test-event', 'test two');

                        (0, _chai.expect)(eventHandler.calledOnce, 'event handler only triggered once').to.be.true;

                        (0, _chai.expect)(eventHandler.calledWith('test'), 'event handler was passed correct arguments').to.be.true;
                });
        });
});
define('ghost-admin/tests/unit/services/notifications-test', ['sinon', 'ember-ajax/errors', 'ghost-admin/services/ajax', 'mocha', 'chai', 'ember-mocha'], function (_sinon, _errors, _ajax, _mocha, _chai, _emberMocha) {
    'use strict';

    var _slicedToArray = function () {
        function sliceIterator(arr, i) {
            var _arr = [];
            var _n = true;
            var _d = false;
            var _e = undefined;

            try {
                for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
                    _arr.push(_s.value);

                    if (i && _arr.length === i) break;
                }
            } catch (err) {
                _d = true;
                _e = err;
            } finally {
                try {
                    if (!_n && _i["return"]) _i["return"]();
                } finally {
                    if (_d) throw _e;
                }
            }

            return _arr;
        }

        return function (arr, i) {
            if (Array.isArray(arr)) {
                return arr;
            } else if (Symbol.iterator in Object(arr)) {
                return sliceIterator(arr, i);
            } else {
                throw new TypeError("Invalid attempt to destructure non-iterable instance");
            }
        };
    }();

    (0, _mocha.describe)('Unit: Service: notifications', function () {
        (0, _emberMocha.setupTest)('service:notifications', {
            needs: ['service:upgradeStatus']
        });

        beforeEach(function () {
            this.subject().set('content', Ember.A());
            this.subject().set('delayedNotifications', Ember.A());
        });

        (0, _mocha.it)('filters alerts/notifications', function () {
            let notifications = this.subject();

            // wrapped in run-loop to enure alerts/notifications CPs are updated
            Ember.run(() => {
                notifications.showAlert('Alert');
                notifications.showNotification('Notification');
            });

            (0, _chai.expect)(notifications.get('alerts.length')).to.equal(1);
            (0, _chai.expect)(notifications.get('alerts.firstObject.message')).to.equal('Alert');

            (0, _chai.expect)(notifications.get('notifications.length')).to.equal(1);
            (0, _chai.expect)(notifications.get('notifications.firstObject.message')).to.equal('Notification');
        });

        (0, _mocha.it)('#handleNotification deals with DS.Notification notifications', function () {
            let notifications = this.subject();
            let notification = Ember.Object.create({ message: '<h1>Test</h1>', status: 'alert' });

            notification.toJSON = function () {};

            notifications.handleNotification(notification);

            notification = notifications.get('alerts')[0];

            // alerts received from the server should be marked html safe
            (0, _chai.expect)(notification.get('message')).to.have.property('toHTML');
        });

        (0, _mocha.it)('#handleNotification defaults to notification if no status supplied', function () {
            let notifications = this.subject();

            notifications.handleNotification({ message: 'Test' }, false);

            (0, _chai.expect)(notifications.get('content')).to.deep.include({ message: 'Test', status: 'notification' });
        });

        (0, _mocha.it)('#showAlert adds POJO alerts', function () {
            let notifications = this.subject();

            Ember.run(() => {
                notifications.showAlert('Test Alert', { type: 'error' });
            });

            (0, _chai.expect)(notifications.get('alerts')).to.deep.include({ message: 'Test Alert', status: 'alert', type: 'error', key: undefined });
        });

        (0, _mocha.it)('#showAlert adds delayed notifications', function () {
            let notifications = this.subject();

            Ember.run(() => {
                notifications.showNotification('Test Alert', { type: 'error', delayed: true });
            });

            (0, _chai.expect)(notifications.get('delayedNotifications')).to.deep.include({ message: 'Test Alert', status: 'notification', type: 'error', key: undefined });
        });

        // in order to cater for complex keys that are suitable for i18n
        // we split on the second period and treat the resulting base as
        // the key for duplicate checking
        (0, _mocha.it)('#showAlert clears duplicates', function () {
            let notifications = this.subject();

            Ember.run(() => {
                notifications.showAlert('Kept');
                notifications.showAlert('Duplicate', { key: 'duplicate.key.fail' });
            });

            (0, _chai.expect)(notifications.get('alerts.length')).to.equal(2);

            Ember.run(() => {
                notifications.showAlert('Duplicate with new message', { key: 'duplicate.key.success' });
            });

            (0, _chai.expect)(notifications.get('alerts.length')).to.equal(2);
            (0, _chai.expect)(notifications.get('alerts.lastObject.message')).to.equal('Duplicate with new message');
        });

        (0, _mocha.it)('#showNotification adds POJO notifications', function () {
            let notifications = this.subject();

            Ember.run(() => {
                notifications.showNotification('Test Notification', { type: 'success' });
            });

            (0, _chai.expect)(notifications.get('notifications')).to.deep.include({ message: 'Test Notification', status: 'notification', type: 'success', key: undefined });
        });

        (0, _mocha.it)('#showNotification adds delayed notifications', function () {
            let notifications = this.subject();

            Ember.run(() => {
                notifications.showNotification('Test Notification', { delayed: true });
            });

            (0, _chai.expect)(notifications.get('delayedNotifications')).to.deep.include({ message: 'Test Notification', status: 'notification', type: undefined, key: undefined });
        });

        (0, _mocha.it)('#showNotification clears existing notifications', function () {
            let notifications = this.subject();

            Ember.run(() => {
                notifications.showNotification('First');
                notifications.showNotification('Second');
            });

            (0, _chai.expect)(notifications.get('notifications.length')).to.equal(1);
            (0, _chai.expect)(notifications.get('notifications')).to.deep.equal([{ message: 'Second', status: 'notification', type: undefined, key: undefined }]);
        });

        (0, _mocha.it)('#showNotification keeps existing notifications if doNotCloseNotifications option passed', function () {
            let notifications = this.subject();

            Ember.run(() => {
                notifications.showNotification('First');
                notifications.showNotification('Second', { doNotCloseNotifications: true });
            });

            (0, _chai.expect)(notifications.get('notifications.length')).to.equal(2);
        });

        (0, _mocha.it)('#showAPIError handles single json response error', function () {
            let notifications = this.subject();
            let error = new _errors.AjaxError({ errors: [{ message: 'Single error' }] });

            Ember.run(() => {
                notifications.showAPIError(error);
            });

            let alert = notifications.get('alerts.firstObject');
            (0, _chai.expect)(Ember.get(alert, 'message')).to.equal('Single error');
            (0, _chai.expect)(Ember.get(alert, 'status')).to.equal('alert');
            (0, _chai.expect)(Ember.get(alert, 'type')).to.equal('error');
            (0, _chai.expect)(Ember.get(alert, 'key')).to.equal('api-error');
        });

        (0, _mocha.it)('#showAPIError handles multiple json response errors', function () {
            let notifications = this.subject();
            let error = new _errors.AjaxError({ errors: [{ title: 'First error', message: 'First error message' }, { title: 'Second error', message: 'Second error message' }] });

            Ember.run(() => {
                notifications.showAPIError(error);
            });

            (0, _chai.expect)(notifications.get('alerts.length')).to.equal(2);

            var _notifications$get = notifications.get('alerts'),
                _notifications$get2 = _slicedToArray(_notifications$get, 2);

            let alert1 = _notifications$get2[0],
                alert2 = _notifications$get2[1];

            (0, _chai.expect)(alert1).to.deep.equal({ message: 'First error message', status: 'alert', type: 'error', key: 'api-error.first-error' });
            (0, _chai.expect)(alert2).to.deep.equal({ message: 'Second error message', status: 'alert', type: 'error', key: 'api-error.second-error' });
        });

        (0, _mocha.it)('#showAPIError displays default error text if response has no error/message', function () {
            let notifications = this.subject();
            let resp = false;

            Ember.run(() => {
                notifications.showAPIError(resp);
            });

            (0, _chai.expect)(notifications.get('content').toArray()).to.deep.equal([{ message: 'There was a problem on the server, please try again.', status: 'alert', type: 'error', key: 'api-error' }]);

            notifications.set('content', Ember.A());

            Ember.run(() => {
                notifications.showAPIError(resp, { defaultErrorText: 'Overridden default' });
            });
            (0, _chai.expect)(notifications.get('content').toArray()).to.deep.equal([{ message: 'Overridden default', status: 'alert', type: 'error', key: 'api-error' }]);
        });

        (0, _mocha.it)('#showAPIError sets correct key when passed a base key', function () {
            let notifications = this.subject();

            Ember.run(() => {
                notifications.showAPIError('Test', { key: 'test.alert' });
            });

            (0, _chai.expect)(notifications.get('alerts.firstObject.key')).to.equal('api-error.test.alert');
        });

        (0, _mocha.it)('#showAPIError sets correct key when not passed a key', function () {
            let notifications = this.subject();

            Ember.run(() => {
                notifications.showAPIError('Test');
            });

            (0, _chai.expect)(notifications.get('alerts.firstObject.key')).to.equal('api-error');
        });

        (0, _mocha.it)('#showAPIError parses default ember-ajax errors correctly', function () {
            let notifications = this.subject();
            let error = new _errors.InvalidError();

            Ember.run(() => {
                notifications.showAPIError(error);
            });

            let notification = notifications.get('alerts.firstObject');
            (0, _chai.expect)(Ember.get(notification, 'message')).to.equal('Request was rejected because it was invalid');
            (0, _chai.expect)(Ember.get(notification, 'status')).to.equal('alert');
            (0, _chai.expect)(Ember.get(notification, 'type')).to.equal('error');
            (0, _chai.expect)(Ember.get(notification, 'key')).to.equal('api-error');
        });

        (0, _mocha.it)('#showAPIError parses custom ember-ajax errors correctly', function () {
            let notifications = this.subject();
            let error = new _ajax.ServerUnreachableError();

            Ember.run(() => {
                notifications.showAPIError(error);
            });

            let notification = notifications.get('alerts.firstObject');
            (0, _chai.expect)(Ember.get(notification, 'message')).to.equal('Server was unreachable');
            (0, _chai.expect)(Ember.get(notification, 'status')).to.equal('alert');
            (0, _chai.expect)(Ember.get(notification, 'type')).to.equal('error');
            (0, _chai.expect)(Ember.get(notification, 'key')).to.equal('api-error');
        });

        (0, _mocha.it)('#displayDelayed moves delayed notifications into content', function () {
            let notifications = this.subject();

            Ember.run(() => {
                notifications.showNotification('First', { delayed: true });
                notifications.showNotification('Second', { delayed: true });
                notifications.showNotification('Third', { delayed: false });
                notifications.displayDelayed();
            });

            (0, _chai.expect)(notifications.get('notifications')).to.deep.equal([{ message: 'Third', status: 'notification', type: undefined, key: undefined }, { message: 'First', status: 'notification', type: undefined, key: undefined }, { message: 'Second', status: 'notification', type: undefined, key: undefined }]);
        });

        (0, _mocha.it)('#closeNotification removes POJO notifications', function () {
            let notification = { message: 'Close test', status: 'notification' };
            let notifications = this.subject();

            Ember.run(() => {
                notifications.handleNotification(notification);
            });

            (0, _chai.expect)(notifications.get('notifications')).to.include(notification);

            Ember.run(() => {
                notifications.closeNotification(notification);
            });

            (0, _chai.expect)(notifications.get('notifications')).to.not.include(notification);
        });

        (0, _mocha.it)('#closeNotification removes and deletes DS.Notification records', function () {
            let notification = Ember.Object.create({ message: 'Close test', status: 'alert' });
            let notifications = this.subject();

            notification.toJSON = function () {};
            notification.deleteRecord = function () {};
            _sinon.default.spy(notification, 'deleteRecord');
            notification.save = function () {
                return {
                    finally(callback) {
                        return callback(notification);
                    }
                };
            };
            _sinon.default.spy(notification, 'save');

            Ember.run(() => {
                notifications.handleNotification(notification);
            });

            (0, _chai.expect)(notifications.get('alerts')).to.include(notification);

            Ember.run(() => {
                notifications.closeNotification(notification);
            });

            (0, _chai.expect)(notification.deleteRecord.calledOnce).to.be.true;
            (0, _chai.expect)(notification.save.calledOnce).to.be.true;

            (0, _chai.expect)(notifications.get('alerts')).to.not.include(notification);
        });

        (0, _mocha.it)('#closeNotifications only removes notifications', function () {
            let notifications = this.subject();

            Ember.run(() => {
                notifications.showAlert('First alert');
                notifications.showNotification('First notification');
                notifications.showNotification('Second notification', { doNotCloseNotifications: true });
            });

            (0, _chai.expect)(notifications.get('alerts.length'), 'alerts count').to.equal(1);
            (0, _chai.expect)(notifications.get('notifications.length'), 'notifications count').to.equal(2);

            Ember.run(() => {
                notifications.closeNotifications();
            });

            (0, _chai.expect)(notifications.get('alerts.length'), 'alerts count').to.equal(1);
            (0, _chai.expect)(notifications.get('notifications.length'), 'notifications count').to.equal(0);
        });

        (0, _mocha.it)('#closeNotifications only closes notifications with specified key', function () {
            let notifications = this.subject();

            Ember.run(() => {
                notifications.showAlert('First alert');
                // using handleNotification as showNotification will auto-prune
                // duplicates and keys will be removed if doNotCloseNotifications
                // is true
                notifications.handleNotification({ message: 'First notification', key: 'test.close', status: 'notification' });
                notifications.handleNotification({ message: 'Second notification', key: 'test.keep', status: 'notification' });
                notifications.handleNotification({ message: 'Third notification', key: 'test.close', status: 'notification' });
            });

            Ember.run(() => {
                notifications.closeNotifications('test.close');
            });

            (0, _chai.expect)(notifications.get('notifications.length'), 'notifications count').to.equal(1);
            (0, _chai.expect)(notifications.get('notifications.firstObject.message'), 'notification message').to.equal('Second notification');
            (0, _chai.expect)(notifications.get('alerts.length'), 'alerts count').to.equal(1);
        });

        (0, _mocha.it)('#clearAll removes everything without deletion', function () {
            let notifications = this.subject();
            let notificationModel = Ember.Object.create({ message: 'model' });

            notificationModel.toJSON = function () {};
            notificationModel.deleteRecord = function () {};
            _sinon.default.spy(notificationModel, 'deleteRecord');
            notificationModel.save = function () {
                return {
                    finally(callback) {
                        return callback(notificationModel);
                    }
                };
            };
            _sinon.default.spy(notificationModel, 'save');

            notifications.handleNotification(notificationModel);
            notifications.handleNotification({ message: 'pojo' });

            notifications.clearAll();

            (0, _chai.expect)(notifications.get('content')).to.be.empty;
            (0, _chai.expect)(notificationModel.deleteRecord.called).to.be.false;
            (0, _chai.expect)(notificationModel.save.called).to.be.false;
        });

        (0, _mocha.it)('#closeAlerts only removes alerts', function () {
            let notifications = this.subject();

            notifications.showNotification('First notification');
            notifications.showAlert('First alert');
            notifications.showAlert('Second alert');

            Ember.run(() => {
                notifications.closeAlerts();
            });

            (0, _chai.expect)(notifications.get('alerts.length')).to.equal(0);
            (0, _chai.expect)(notifications.get('notifications.length')).to.equal(1);
        });

        (0, _mocha.it)('#closeAlerts closes only alerts with specified key', function () {
            let notifications = this.subject();

            notifications.showNotification('First notification');
            notifications.showAlert('First alert', { key: 'test.close' });
            notifications.showAlert('Second alert', { key: 'test.keep' });
            notifications.showAlert('Third alert', { key: 'test.close' });

            Ember.run(() => {
                notifications.closeAlerts('test.close');
            });

            (0, _chai.expect)(notifications.get('alerts.length')).to.equal(1);
            (0, _chai.expect)(notifications.get('alerts.firstObject.message')).to.equal('Second alert');
            (0, _chai.expect)(notifications.get('notifications.length')).to.equal(1);
        });
    });
});
define('ghost-admin/tests/unit/services/resize-detector-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Service: resize-detector', function () {
        (0, _emberMocha.setupTest)('service:resize-detector', {
            // Specify the other units that are required for this test.
            // needs: ['service:foo']
        });

        // Replace this with your real tests.
        (0, _mocha.it)('exists', function () {
            let service = this.subject();
            (0, _chai.expect)(service).to.be.ok;
        });
    });
});
define('ghost-admin/tests/unit/services/ui-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Service: ui', function () {
        (0, _emberMocha.setupTest)('service:ui', {
            needs: ['service:dropdown', 'service:mediaQueries']
        });

        // Replace this with your real tests.
        (0, _mocha.it)('exists', function () {
            let service = this.subject();
            (0, _chai.expect)(service).to.be.ok;
        });
    });
});
define('ghost-admin/tests/unit/services/unsplash-test', ['pretender', 'ember-test-helpers/wait', 'mocha', 'ghost-admin/tests/helpers/adapter-error', 'chai', 'ember-mocha'], function (_pretender, _wait, _mocha, _adapterError, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Service: unsplash', function () {
        (0, _emberMocha.setupTest)('service:unsplash', {
            needs: ['service:ajax', 'service:config', 'service:ghostPaths', 'service:settings']
        });

        let server;

        beforeEach(function () {
            server = new _pretender.default();
        });

        afterEach(function () {
            server.shutdown();
        });

        (0, _mocha.it)('can load new');
        (0, _mocha.it)('can load next page');

        (0, _mocha.describe)('search', function () {
            (0, _mocha.it)('sends search request');
            (0, _mocha.it)('debounces query updates');
            (0, _mocha.it)('can load next page of search results');
            (0, _mocha.it)('clears photos when starting new search');
            (0, _mocha.it)('loads new when query is cleared');
        });

        (0, _mocha.describe)('columns', function () {
            (0, _mocha.it)('sorts photos into columns based on column height');
            (0, _mocha.it)('can change column count');
        });

        (0, _mocha.describe)('error handling', function () {
            (0, _mocha.it)('handles rate limit exceeded', async function () {
                server.get('https://api.unsplash.com/photos', function () {
                    return [403, { 'x-ratelimit-remaining': '0' }, 'Rate Limit Exceeded'];
                });

                let service = this.subject();

                Ember.run(() => {
                    service.loadNextPage();
                });
                await (0, _wait.default)();

                (0, _adapterError.errorOverride)();
                (0, _chai.expect)(service.get('error')).to.have.string('Unsplash API rate limit reached');
                (0, _adapterError.errorReset)();
            });

            (0, _mocha.it)('handles json errors', async function () {
                server.get('https://api.unsplash.com/photos', function () {
                    return [500, { 'Content-Type': 'application/json' }, JSON.stringify({
                        errors: ['Unsplash API Error']
                    })];
                });

                let service = this.subject();

                Ember.run(() => {
                    service.loadNextPage();
                });
                await (0, _wait.default)();

                (0, _adapterError.errorOverride)();
                (0, _chai.expect)(service.get('error')).to.equal('Unsplash API Error');
                (0, _adapterError.errorReset)();
            });

            (0, _mocha.it)('handles text errors', async function () {
                server.get('https://api.unsplash.com/photos', function () {
                    return [500, { 'Content-Type': 'text/xml' }, 'Unsplash text error'];
                });

                let service = this.subject();

                Ember.run(() => {
                    service.loadNextPage();
                });
                await (0, _wait.default)();

                (0, _adapterError.errorOverride)();
                (0, _chai.expect)(service.get('error')).to.equal('Unsplash text error');
                (0, _adapterError.errorReset)();
            });
        });

        (0, _mocha.describe)('isLoading', function () {
            (0, _mocha.it)('is false by default');
            (0, _mocha.it)('is true when loading new');
            (0, _mocha.it)('is true when loading next page');
            (0, _mocha.it)('is true when searching');
            (0, _mocha.it)('returns to false when finished');
        });
    });
});
define('ghost-admin/tests/unit/services/upgrade-status-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Service: upgrade-status', function () {
        (0, _emberMocha.setupTest)('service:upgrade-status', {
            // Specify the other units that are required for this test.
            // needs: ['service:foo']
            needs: ['service:notifications']
        });

        // Replace this with your real tests.
        (0, _mocha.it)('exists', function () {
            let service = this.subject();
            (0, _chai.expect)(service).to.be.ok;
        });
    });
});
define('ghost-admin/tests/unit/transforms/facebook-url-user-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Transform: facebook-url-user', function () {
        (0, _emberMocha.setupTest)('transform:facebook-url-user', {});
        (0, _mocha.it)('deserializes facebook url', function () {
            let transform = this.subject();
            let serialized = 'testuser';
            let result = transform.deserialize(serialized);

            (0, _chai.expect)(result).to.equal('https://www.facebook.com/testuser');
        });

        (0, _mocha.it)('serializes url to facebook username', function () {
            let transform = this.subject();
            let deserialized = 'https://www.facebook.com/testuser';
            let result = transform.serialize(deserialized);

            (0, _chai.expect)(result).to.equal('testuser');
        });
    });
});
define('ghost-admin/tests/unit/transforms/json-string-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Transform: json-string', function () {
        (0, _emberMocha.setupTest)('transform:json-string', {});

        (0, _mocha.it)('serialises an Object to a JSON String', function () {
            let transform = this.subject();
            let obj = { one: 'one', two: 'two' };
            (0, _chai.expect)(transform.serialize(obj)).to.equal(JSON.stringify(obj));
        });

        (0, _mocha.it)('deserialises a JSON String to an Object', function () {
            let transform = this.subject();
            let obj = { one: 'one', two: 'two' };
            (0, _chai.expect)(transform.deserialize(JSON.stringify(obj))).to.deep.equal(obj);
        });

        (0, _mocha.it)('handles deserializing a blank string', function () {
            let transform = this.subject();
            (0, _chai.expect)(transform.deserialize('')).to.equal(null);
        });
    });
});
define('ghost-admin/tests/unit/transforms/navigation-settings-test', ['ghost-admin/models/navigation-item', 'mocha', 'chai', 'ember-mocha'], function (_navigationItem, _mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Transform: navigation-settings', function () {
        (0, _emberMocha.setupTest)('transform:navigation-settings', {});
        (0, _mocha.it)('deserializes navigation json', function () {
            let transform = this.subject();
            let serialized = '[{"label":"One","url":"/one"},{"label":"Two","url":"/two"}]';
            let result = transform.deserialize(serialized);

            (0, _chai.expect)(result.length).to.equal(2);
            (0, _chai.expect)(result[0]).to.be.instanceof(_navigationItem.default);
            (0, _chai.expect)(result[0].get('label')).to.equal('One');
            (0, _chai.expect)(result[0].get('url')).to.equal('/one');
            (0, _chai.expect)(result[1]).to.be.instanceof(_navigationItem.default);
            (0, _chai.expect)(result[1].get('label')).to.equal('Two');
            (0, _chai.expect)(result[1].get('url')).to.equal('/two');
        });

        (0, _mocha.it)('serializes array of NavigationItems', function () {
            let transform = this.subject();
            let deserialized = Ember.A([_navigationItem.default.create({ label: 'One', url: '/one' }), _navigationItem.default.create({ label: 'Two', url: '/two' })]);
            let result = transform.serialize(deserialized);

            (0, _chai.expect)(result).to.equal('[{"label":"One","url":"/one"},{"label":"Two","url":"/two"}]');
        });
    });
});
define('ghost-admin/tests/unit/transforms/slack-settings-test', ['ghost-admin/models/slack-integration', 'mocha', 'chai', 'ember-mocha'], function (_slackIntegration, _mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Transform: slack-settings', function () {
        (0, _emberMocha.setupTest)('transform:slack-settings', {});

        (0, _mocha.it)('deserializes settings json', function () {
            let transform = this.subject();
            let serialized = '[{"url":"http://myblog.com/blogpost1"}]';
            let result = transform.deserialize(serialized);

            (0, _chai.expect)(result.length).to.equal(1);
            (0, _chai.expect)(result[0]).to.be.instanceof(_slackIntegration.default);
            (0, _chai.expect)(result[0].get('url')).to.equal('http://myblog.com/blogpost1');
        });

        (0, _mocha.it)('deserializes empty array', function () {
            let transform = this.subject();
            let serialized = '[]';
            let result = transform.deserialize(serialized);

            (0, _chai.expect)(result.length).to.equal(1);
            (0, _chai.expect)(result[0]).to.be.instanceof(_slackIntegration.default);
            (0, _chai.expect)(result[0].get('url')).to.equal('');
        });

        (0, _mocha.it)('serializes array of Slack settings', function () {
            let transform = this.subject();
            let deserialized = Ember.A([_slackIntegration.default.create({ url: 'http://myblog.com/blogpost1' })]);
            let result = transform.serialize(deserialized);

            (0, _chai.expect)(result).to.equal('[{"url":"http://myblog.com/blogpost1"}]');
        });

        (0, _mocha.it)('serializes empty SlackIntegration objects', function () {
            let transform = this.subject();
            let deserialized = Ember.A([_slackIntegration.default.create({ url: '' })]);
            let result = transform.serialize(deserialized);

            (0, _chai.expect)(result).to.equal('[]');
        });
    });
});
define('ghost-admin/tests/unit/transforms/twitter-url-user-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Transform: twitter-url-user', function () {
        (0, _emberMocha.setupTest)('transform:twitter-url-user', {});
        (0, _mocha.it)('deserializes twitter url', function () {
            let transform = this.subject();
            let serialized = '@testuser';
            let result = transform.deserialize(serialized);

            (0, _chai.expect)(result).to.equal('https://twitter.com/testuser');
        });

        (0, _mocha.it)('serializes url to twitter username', function () {
            let transform = this.subject();
            let deserialized = 'https://twitter.com/testuser';
            let result = transform.serialize(deserialized);

            (0, _chai.expect)(result).to.equal('@testuser');
        });
    });
});
define('ghost-admin/tests/unit/transforms/unsplash-settings-test', ['mocha', 'chai', 'ember-mocha'], function (_mocha, _chai, _emberMocha) {
    'use strict';

    (0, _mocha.describe)('Unit: Transform: unsplash-settings', function () {
        (0, _emberMocha.setupTest)('transform:unsplash-settings', {
            // Specify the other units that are required for this test.
            // needs: ['transform:foo']
        });

        (0, _mocha.it)('deserializes to default value when null', function () {
            let serialized = null;
            let result = this.subject().deserialize(serialized);
            (0, _chai.expect)(result.isActive).to.be.true;
        });

        (0, _mocha.it)('deserializes to default value when blank string', function () {
            let serialized = '';
            let result = this.subject().deserialize(serialized);
            (0, _chai.expect)(result.isActive).to.be.true;
        });

        (0, _mocha.it)('deserializes to default value when invalid JSON', function () {
            let serialized = 'not JSON';
            let result = this.subject().deserialize(serialized);
            (0, _chai.expect)(result.isActive).to.be.true;
        });

        (0, _mocha.it)('deserializes valid JSON object', function () {
            let serialized = '{"isActive":false}';
            let result = this.subject().deserialize(serialized);
            (0, _chai.expect)(result.isActive).to.be.false;
        });

        (0, _mocha.it)('serializes to JSON string', function () {
            let deserialized = { isActive: false };
            let result = this.subject().serialize(deserialized);
            (0, _chai.expect)(result).to.equal('{"isActive":false}');
        });

        (0, _mocha.it)('serializes to default value when blank', function () {
            let deserialized = '';
            let result = this.subject().serialize(deserialized);
            (0, _chai.expect)(result).to.equal('{"isActive":true}');
        });
    });
});
define('ghost-admin/tests/unit/utils/ghost-paths-test', ['ghost-admin/utils/ghost-paths'], function (_ghostPaths) {
            'use strict';

            describe('Unit: Util: ghost-paths', function () {
                        describe('join', function () {
                                    let join = (0, _ghostPaths.default)().url.join;


                                    it('should join two or more paths, normalizing slashes', function () {
                                                let path;

                                                path = join('/one/', '/two/');
                                                expect(path).to.equal('/one/two/');

                                                path = join('/one', '/two/');
                                                expect(path).to.equal('/one/two/');

                                                path = join('/one/', 'two/');
                                                expect(path).to.equal('/one/two/');

                                                path = join('/one/', 'two/', '/three/');
                                                expect(path).to.equal('/one/two/three/');

                                                path = join('/one/', 'two', 'three/');
                                                expect(path).to.equal('/one/two/three/');
                                    });

                                    it('should not change the slash at the beginning', function () {
                                                let path;

                                                path = join('one/');
                                                expect(path).to.equal('one/');
                                                path = join('one/', 'two');
                                                expect(path).to.equal('one/two/');
                                                path = join('/one/', 'two');
                                                expect(path).to.equal('/one/two/');
                                                path = join('one/', 'two', 'three');
                                                expect(path).to.equal('one/two/three/');
                                                path = join('/one/', 'two', 'three');
                                                expect(path).to.equal('/one/two/three/');
                                    });

                                    it('should always return a slash at the end', function () {
                                                let path;

                                                path = join();
                                                expect(path).to.equal('/');
                                                path = join('');
                                                expect(path).to.equal('/');
                                                path = join('one');
                                                expect(path).to.equal('one/');
                                                path = join('one/');
                                                expect(path).to.equal('one/');
                                                path = join('one', 'two');
                                                expect(path).to.equal('one/two/');
                                                path = join('one', 'two/');
                                                expect(path).to.equal('one/two/');
                                    });
                        });
            });
});
define('ghost-admin/tests/unit/validators/nav-item-test', ['ghost-admin/models/navigation-item', 'ghost-admin/validators/nav-item', 'mocha', 'chai'], function (_navigationItem, _navItem, _mocha, _chai) {
    'use strict';

    const testInvalidUrl = function testInvalidUrl(url) {
        let navItem = _navigationItem.default.create({ url });

        _navItem.default.check(navItem, 'url');

        (0, _chai.expect)(_navItem.default.get('passed'), `"${url}" passed`).to.be.false;
        (0, _chai.expect)(navItem.get('errors').errorsFor('url').toArray()).to.deep.equal([{
            attribute: 'url',
            message: 'You must specify a valid URL or relative path'
        }]);
        (0, _chai.expect)(navItem.get('hasValidated')).to.include('url');
    };

    const testValidUrl = function testValidUrl(url) {
        let navItem = _navigationItem.default.create({ url });

        _navItem.default.check(navItem, 'url');

        (0, _chai.expect)(_navItem.default.get('passed'), `"${url}" failed`).to.be.true;
        (0, _chai.expect)(navItem.get('hasValidated')).to.include('url');
    };

    (0, _mocha.describe)('Unit: Validator: nav-item', function () {
        (0, _mocha.it)('requires label presence', function () {
            let navItem = _navigationItem.default.create();

            _navItem.default.check(navItem, 'label');

            (0, _chai.expect)(_navItem.default.get('passed')).to.be.false;
            (0, _chai.expect)(navItem.get('errors').errorsFor('label').toArray()).to.deep.equal([{
                attribute: 'label',
                message: 'You must specify a label'
            }]);
            (0, _chai.expect)(navItem.get('hasValidated')).to.include('label');
        });

        (0, _mocha.it)('requires url presence', function () {
            let navItem = _navigationItem.default.create();

            _navItem.default.check(navItem, 'url');

            (0, _chai.expect)(_navItem.default.get('passed')).to.be.false;
            (0, _chai.expect)(navItem.get('errors').errorsFor('url').toArray()).to.deep.equal([{
                attribute: 'url',
                message: 'You must specify a URL or relative path'
            }]);
            (0, _chai.expect)(navItem.get('hasValidated')).to.include('url');
        });

        (0, _mocha.it)('fails on invalid url values', function () {
            let invalidUrls = ['test@example.com', '/has spaces', 'no-leading-slash', 'http://example.com/with spaces'];

            invalidUrls.forEach(function (url) {
                testInvalidUrl(url);
            });
        });

        (0, _mocha.it)('passes on valid url values', function () {
            let validUrls = ['http://localhost:2368', 'http://localhost:2368/some-path', 'https://localhost:2368/some-path', '//localhost:2368/some-path', 'http://localhost:2368/#test', 'http://localhost:2368/?query=test&another=example', 'http://localhost:2368/?query=test&another=example#test', 'tel:01234-567890', 'mailto:test@example.com', 'http://some:user@example.com:1234', '/relative/path'];

            validUrls.forEach(function (url) {
                testValidUrl(url);
            });
        });

        (0, _mocha.it)('validates url and label by default', function () {
            let navItem = _navigationItem.default.create();

            _navItem.default.check(navItem);

            (0, _chai.expect)(navItem.get('errors').errorsFor('label')).to.not.be.empty;
            (0, _chai.expect)(navItem.get('errors').errorsFor('url')).to.not.be.empty;
            (0, _chai.expect)(_navItem.default.get('passed')).to.be.false;
        });
    });
});
define('ghost-admin/tests/unit/validators/slack-integration-test', ['ghost-admin/models/slack-integration', 'ghost-admin/validators/slack-integration', 'mocha', 'chai'], function (_slackIntegration, _slackIntegration2, _mocha, _chai) {
    'use strict';

    const testInvalidUrl = function testInvalidUrl(url) {
        let slackObject = _slackIntegration.default.create({ url });

        _slackIntegration2.default.check(slackObject, 'url');

        (0, _chai.expect)(_slackIntegration2.default.get('passed'), `"${url}" passed`).to.be.false;
        (0, _chai.expect)(slackObject.get('errors').errorsFor('url').toArray()).to.deep.equal([{
            attribute: 'url',
            message: 'The URL must be in a format like https://hooks.slack.com/services/<your personal key>'
        }]);
        (0, _chai.expect)(slackObject.get('hasValidated')).to.include('url');
    };

    const testValidUrl = function testValidUrl(url) {
        let slackObject = _slackIntegration.default.create({ url });

        _slackIntegration2.default.check(slackObject, 'url');

        (0, _chai.expect)(_slackIntegration2.default.get('passed'), `"${url}" failed`).to.be.true;
        (0, _chai.expect)(slackObject.get('hasValidated')).to.include('url');
    };

    (0, _mocha.describe)('Unit: Validator: slack-integration', function () {
        (0, _mocha.it)('fails on invalid url values', function () {
            let invalidUrls = ['test@example.com', '/has spaces', 'no-leading-slash', 'http://example.com/with spaces'];

            invalidUrls.forEach(function (url) {
                testInvalidUrl(url);
            });
        });

        (0, _mocha.it)('passes on valid url values', function () {
            let validUrls = ['https://hooks.slack.com/services/;alskdjf', 'https://hooks.slack.com/services/123445678', 'https://hooks.slack.com/services/some_webhook', 'https://discordapp.com/api/webhooks/380692408364433418/mGLHSRyEoUaTvY91Te16WOT8Obn-BrJoiTNoxeUqhb6klKERb9xaZkUBYC5AeduwYCCy/slack'];

            validUrls.forEach(function (url) {
                testValidUrl(url);
            });
        });

        (0, _mocha.it)('validates url by default', function () {
            let slackObject = _slackIntegration.default.create();

            _slackIntegration2.default.check(slackObject);

            (0, _chai.expect)(slackObject.get('errors').errorsFor('url')).to.be.empty;
            (0, _chai.expect)(_slackIntegration2.default.get('passed')).to.be.true;
        });
    });
});
define('ghost-admin/tests/unit/validators/subscriber-test', ['ghost-admin/mixins/validation-engine', 'mocha', 'chai'], function (_validationEngine, _mocha, _chai) {
    'use strict';

    const Subscriber = Ember.Object.extend(_validationEngine.default, {
        validationType: 'subscriber',

        email: null
    });

    (0, _mocha.describe)('Unit: Validator: subscriber', function () {
        (0, _mocha.it)('validates email by default', function () {
            let subscriber = Subscriber.create({});
            let properties = subscriber.get('validators.subscriber.properties');

            (0, _chai.expect)(properties, 'properties').to.include('email');
        });

        (0, _mocha.it)('passes with a valid email', function () {
            let subscriber = Subscriber.create({ email: 'test@example.com' });
            let passed = false;

            Ember.run(() => {
                subscriber.validate({ property: 'email' }).then(() => {
                    passed = true;
                });
            });

            (0, _chai.expect)(passed, 'passed').to.be.true;
            (0, _chai.expect)(subscriber.get('hasValidated'), 'hasValidated').to.include('email');
        });

        (0, _mocha.it)('validates email presence', function () {
            let subscriber = Subscriber.create({});
            let passed = false;

            Ember.run(() => {
                subscriber.validate({ property: 'email' }).then(() => {
                    passed = true;
                });
            });

            let emailErrors = subscriber.get('errors').errorsFor('email').get(0);
            (0, _chai.expect)(emailErrors.attribute, 'errors.email.attribute').to.equal('email');
            (0, _chai.expect)(emailErrors.message, 'errors.email.message').to.equal('Please enter an email.');

            (0, _chai.expect)(passed, 'passed').to.be.false;
            (0, _chai.expect)(subscriber.get('hasValidated'), 'hasValidated').to.include('email');
        });

        (0, _mocha.it)('validates email', function () {
            let subscriber = Subscriber.create({ email: 'foo' });
            let passed = false;

            Ember.run(() => {
                subscriber.validate({ property: 'email' }).then(() => {
                    passed = true;
                });
            });

            let emailErrors = subscriber.get('errors').errorsFor('email').get(0);
            (0, _chai.expect)(emailErrors.attribute, 'errors.email.attribute').to.equal('email');
            (0, _chai.expect)(emailErrors.message, 'errors.email.message').to.equal('Invalid email.');

            (0, _chai.expect)(passed, 'passed').to.be.false;
            (0, _chai.expect)(subscriber.get('hasValidated'), 'hasValidated').to.include('email');
        });
    });
});
define('ghost-admin/tests/unit/validators/tag-settings-test', ['ghost-admin/mixins/validation-engine', 'mocha', 'chai'], function (_validationEngine, _mocha, _chai) {
    'use strict';

    // import validator from 'ghost-admin/validators/tag-settings';
    const Tag = Ember.Object.extend(_validationEngine.default, {
        validationType: 'tag',

        name: null,
        description: null,
        metaTitle: null,
        metaDescription: null
    });

    // TODO: These tests have way too much duplication, consider creating test
    // helpers for validations

    // TODO: Move testing of validation-engine behaviour into validation-engine-test
    // and replace these tests with specific validator tests

    (0, _mocha.describe)('Unit: Validator: tag-settings', function () {
        (0, _mocha.it)('validates all fields by default', function () {
            let tag = Tag.create({});
            let properties = tag.get('validators.tag.properties');

            // TODO: This is checking implementation details rather than expected
            // behaviour. Replace once we have consistent behaviour (see below)
            (0, _chai.expect)(properties, 'properties').to.include('name');
            (0, _chai.expect)(properties, 'properties').to.include('slug');
            (0, _chai.expect)(properties, 'properties').to.include('description');
            (0, _chai.expect)(properties, 'properties').to.include('metaTitle');
            (0, _chai.expect)(properties, 'properties').to.include('metaDescription');

            // TODO: .validate (and  by extension .save) doesn't currently affect
            // .hasValidated - it would be good to make this consistent.
            // The following tests currently fail:
            //
            // run(() => {
            //     tag.validate();
            // });
            //
            // expect(tag.get('hasValidated'), 'hasValidated').to.include('name');
            // expect(tag.get('hasValidated'), 'hasValidated').to.include('description');
            // expect(tag.get('hasValidated'), 'hasValidated').to.include('metaTitle');
            // expect(tag.get('hasValidated'), 'hasValidated').to.include('metaDescription');
        });

        (0, _mocha.it)('passes with valid name', function () {
            // longest valid name
            let tag = Tag.create({ name: new Array(192).join('x') });
            let passed = false;

            (0, _chai.expect)(tag.get('name').length, 'name length').to.equal(191);

            Ember.run(() => {
                tag.validate({ property: 'name' }).then(() => {
                    passed = true;
                });
            });

            (0, _chai.expect)(passed, 'passed').to.be.true;
            (0, _chai.expect)(tag.get('hasValidated'), 'hasValidated').to.include('name');
        });

        (0, _mocha.it)('validates name presence', function () {
            let tag = Tag.create();
            let passed = false;
            let nameErrors;

            // TODO: validator is currently a singleton meaning state leaks
            // between all objects that use it. Each object should either
            // get it's own validator instance or validator objects should not
            // contain state. The following currently fails:
            //
            // let validator = tag.get('validators.tag')
            // expect(validator.get('passed'), 'passed').to.be.false;

            Ember.run(() => {
                tag.validate({ property: 'name' }).then(() => {
                    passed = true;
                });
            });

            nameErrors = tag.get('errors').errorsFor('name').get(0);
            (0, _chai.expect)(nameErrors.attribute, 'errors.name.attribute').to.equal('name');
            (0, _chai.expect)(nameErrors.message, 'errors.name.message').to.equal('You must specify a name for the tag.');

            (0, _chai.expect)(passed, 'passed').to.be.false;
            (0, _chai.expect)(tag.get('hasValidated'), 'hasValidated').to.include('name');
        });

        (0, _mocha.it)('validates names starting with a comma', function () {
            let tag = Tag.create({ name: ',test' });
            let passed = false;
            let nameErrors;

            Ember.run(() => {
                tag.validate({ property: 'name' }).then(() => {
                    passed = true;
                });
            });

            nameErrors = tag.get('errors').errorsFor('name').get(0);
            (0, _chai.expect)(nameErrors.attribute, 'errors.name.attribute').to.equal('name');
            (0, _chai.expect)(nameErrors.message, 'errors.name.message').to.equal('Tag names can\'t start with commas.');

            (0, _chai.expect)(passed, 'passed').to.be.false;
            (0, _chai.expect)(tag.get('hasValidated'), 'hasValidated').to.include('name');
        });

        (0, _mocha.it)('validates name length', function () {
            // shortest invalid name
            let tag = Tag.create({ name: new Array(193).join('x') });
            let passed = false;
            let nameErrors;

            (0, _chai.expect)(tag.get('name').length, 'name length').to.equal(192);

            Ember.run(() => {
                tag.validate({ property: 'name' }).then(() => {
                    passed = true;
                });
            });

            nameErrors = tag.get('errors').errorsFor('name')[0];
            (0, _chai.expect)(nameErrors.attribute, 'errors.name.attribute').to.equal('name');
            (0, _chai.expect)(nameErrors.message, 'errors.name.message').to.equal('Tag names cannot be longer than 191 characters.');

            (0, _chai.expect)(passed, 'passed').to.be.false;
            (0, _chai.expect)(tag.get('hasValidated'), 'hasValidated').to.include('name');
        });

        (0, _mocha.it)('passes with valid slug', function () {
            // longest valid slug
            let tag = Tag.create({ slug: new Array(192).join('x') });
            let passed = false;

            (0, _chai.expect)(tag.get('slug').length, 'slug length').to.equal(191);

            Ember.run(() => {
                tag.validate({ property: 'slug' }).then(() => {
                    passed = true;
                });
            });

            (0, _chai.expect)(passed, 'passed').to.be.true;
            (0, _chai.expect)(tag.get('hasValidated'), 'hasValidated').to.include('slug');
        });

        (0, _mocha.it)('validates slug length', function () {
            // shortest invalid slug
            let tag = Tag.create({ slug: new Array(193).join('x') });
            let passed = false;
            let slugErrors;

            (0, _chai.expect)(tag.get('slug').length, 'slug length').to.equal(192);

            Ember.run(() => {
                tag.validate({ property: 'slug' }).then(() => {
                    passed = true;
                });
            });

            slugErrors = tag.get('errors').errorsFor('slug')[0];
            (0, _chai.expect)(slugErrors.attribute, 'errors.slug.attribute').to.equal('slug');
            (0, _chai.expect)(slugErrors.message, 'errors.slug.message').to.equal('URL cannot be longer than 191 characters.');

            (0, _chai.expect)(passed, 'passed').to.be.false;
            (0, _chai.expect)(tag.get('hasValidated'), 'hasValidated').to.include('slug');
        });

        (0, _mocha.it)('passes with a valid description', function () {
            // longest valid description
            let tag = Tag.create({ description: new Array(501).join('x') });
            let passed = false;

            (0, _chai.expect)(tag.get('description').length, 'description length').to.equal(500);

            Ember.run(() => {
                tag.validate({ property: 'description' }).then(() => {
                    passed = true;
                });
            });

            (0, _chai.expect)(passed, 'passed').to.be.true;
            (0, _chai.expect)(tag.get('hasValidated'), 'hasValidated').to.include('description');
        });

        (0, _mocha.it)('validates description length', function () {
            // shortest invalid description
            let tag = Tag.create({ description: new Array(502).join('x') });
            let passed = false;
            let errors;

            (0, _chai.expect)(tag.get('description').length, 'description length').to.equal(501);

            Ember.run(() => {
                tag.validate({ property: 'description' }).then(() => {
                    passed = true;
                });
            });

            errors = tag.get('errors').errorsFor('description')[0];
            (0, _chai.expect)(errors.attribute, 'errors.description.attribute').to.equal('description');
            (0, _chai.expect)(errors.message, 'errors.description.message').to.equal('Description cannot be longer than 500 characters.');

            // TODO: tag.errors appears to be a singleton and previous errors are
            // not cleared despite creating a new tag object
            //
            // console.log(JSON.stringify(tag.get('errors')));
            // expect(tag.get('errors.length')).to.equal(1);

            (0, _chai.expect)(passed, 'passed').to.be.false;
            (0, _chai.expect)(tag.get('hasValidated'), 'hasValidated').to.include('description');
        });

        // TODO: we have both metaTitle and metaTitle property names on the
        // model/validator respectively - this should be standardised
        (0, _mocha.it)('passes with a valid metaTitle', function () {
            // longest valid metaTitle
            let tag = Tag.create({ metaTitle: new Array(301).join('x') });
            let passed = false;

            (0, _chai.expect)(tag.get('metaTitle').length, 'metaTitle length').to.equal(300);

            Ember.run(() => {
                tag.validate({ property: 'metaTitle' }).then(() => {
                    passed = true;
                });
            });

            (0, _chai.expect)(passed, 'passed').to.be.true;
            (0, _chai.expect)(tag.get('hasValidated'), 'hasValidated').to.include('metaTitle');
        });

        (0, _mocha.it)('validates metaTitle length', function () {
            // shortest invalid metaTitle
            let tag = Tag.create({ metaTitle: new Array(302).join('x') });
            let passed = false;
            let errors;

            (0, _chai.expect)(tag.get('metaTitle').length, 'metaTitle length').to.equal(301);

            Ember.run(() => {
                tag.validate({ property: 'metaTitle' }).then(() => {
                    passed = true;
                });
            });

            errors = tag.get('errors').errorsFor('metaTitle')[0];
            (0, _chai.expect)(errors.attribute, 'errors.metaTitle.attribute').to.equal('metaTitle');
            (0, _chai.expect)(errors.message, 'errors.metaTitle.message').to.equal('Meta Title cannot be longer than 300 characters.');

            (0, _chai.expect)(passed, 'passed').to.be.false;
            (0, _chai.expect)(tag.get('hasValidated'), 'hasValidated').to.include('metaTitle');
        });

        // TODO: we have both metaDescription and metaDescription property names on
        // the model/validator respectively - this should be standardised
        (0, _mocha.it)('passes with a valid metaDescription', function () {
            // longest valid description
            let tag = Tag.create({ metaDescription: new Array(501).join('x') });
            let passed = false;

            (0, _chai.expect)(tag.get('metaDescription').length, 'metaDescription length').to.equal(500);

            Ember.run(() => {
                tag.validate({ property: 'metaDescription' }).then(() => {
                    passed = true;
                });
            });

            (0, _chai.expect)(passed, 'passed').to.be.true;
            (0, _chai.expect)(tag.get('hasValidated'), 'hasValidated').to.include('metaDescription');
        });

        (0, _mocha.it)('validates metaDescription length', function () {
            // shortest invalid metaDescription
            let tag = Tag.create({ metaDescription: new Array(502).join('x') });
            let passed = false;
            let errors;

            (0, _chai.expect)(tag.get('metaDescription').length, 'metaDescription length').to.equal(501);

            Ember.run(() => {
                tag.validate({ property: 'metaDescription' }).then(() => {
                    passed = true;
                });
            });

            errors = tag.get('errors').errorsFor('metaDescription')[0];
            (0, _chai.expect)(errors.attribute, 'errors.metaDescription.attribute').to.equal('metaDescription');
            (0, _chai.expect)(errors.message, 'errors.metaDescription.message').to.equal('Meta Description cannot be longer than 500 characters.');

            (0, _chai.expect)(passed, 'passed').to.be.false;
            (0, _chai.expect)(tag.get('hasValidated'), 'hasValidated').to.include('metaDescription');
        });
    });
});
define('ghost-admin/config/environment', [], function() {
  var prefix = 'ghost-admin';
try {
  var metaName = prefix + '/config/environment';
  var rawConfig = document.querySelector('meta[name="' + metaName + '"]').getAttribute('content');
  var config = JSON.parse(unescape(rawConfig));

  var exports = { 'default': config };

  Object.defineProperty(exports, '__esModule', { value: true });

  return exports;
}
catch(err) {
  throw new Error('Could not read config from meta tag with name "' + metaName + '".');
}

});

require('ghost-admin/tests/test-helper');
EmberENV.TESTS_FILE_LOADED = true;
//# sourceMappingURL=tests.map
