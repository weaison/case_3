/* ---------- Хранилище ---------- */

const KEY = 'blog_db';

const db = {
    users: [],
    posts: [],
    comments: [],
    follows: [],
    session: null
};

function loadDB() {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) Object.assign(db, JSON.parse(raw));
    } catch (e) {
        console.warn('Ошибка чтения данных', e);
    }
}

function saveDB() {
    localStorage.setItem(KEY, JSON.stringify(db));
}

/* ---------- Утилиты ---------- */

function nextId(list) {
    return list.length ? Math.max(...list.map(x => x.id)) + 1 : 1;
}

function currentUser() {
    return db.session ? db.users.find(u => u.id === db.session.userId) : null;
}

function userByName(name) {
    return db.users.find(u => u.username === name);
}

function userById(id) {
    return db.users.find(u => u.id === id);
}

function postById(id) {
    return db.posts.find(p => p.id === id);
}

function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
}

function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
    }
    return 'h' + Math.abs(h).toString(36);
}

function fmtDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU') + ' ' +
           d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function flash(msg, type = 'ok') {
    const el = document.createElement('div');
    el.className = 'flash ' + type;
    el.textContent = msg;
    const main = document.getElementById('app');
    main.insertBefore(el, main.firstChild);
    setTimeout(() => el.remove(), 3200);
}

function parseTags(raw) {
    const set = new Set(
        String(raw || '').toLowerCase().split(/[,\s]+/).filter(Boolean)
    );
    return [...set];
}

function isFollowing(followerId, followedId) {
    return db.follows.some(f =>
        f.followerId === followerId && f.followedId === followedId);
}

/* ---------- Начальные данные ---------- */

function seed() {
    if (db.users.length) return;

    db.users.push({
        id: 1,
        username: 'admin',
        email: 'admin@blog.local',
        password: hash('admin123')
    });

    saveDB();
}

/* ---------- Навигация ---------- */

function renderNav() {
    const nav = document.getElementById('nav');
    const user = currentUser();
    let html = `<a href="#/">Публичные посты</a>`;

    if (user) {
        html += `<a href="#/feed">Моя лента</a>`;
        html += `<a href="#/new">Новый пост</a>`;
        html += `<a href="#/user/${esc(user.username)}">${esc(user.username)}</a>`;
        html += `<a href="#" id="logout">Выйти</a>`;
    } else {
        html += `<a href="#/login">Вход</a>`;
        html += `<a href="#/register">Регистрация</a>`;
    }

    nav.innerHTML = html;

    const out = document.getElementById('logout');
    if (out) out.onclick = e => {
        e.preventDefault();
        db.session = null;
        saveDB();
        location.hash = '#/';
        render();
    };
}

/* ---------- Роутер ---------- */

function render() {
    const hash = location.hash || '#/';
    const [path, queryStr] = hash.replace(/^#/, '').split('?');
    const parts = path.split('/').filter(Boolean);
    const app = document.getElementById('app');

    renderNav();
    app.innerHTML = '';

    const route = parts[0] || '';

    if (route === '')             return viewIndex(app, new URLSearchParams(queryStr || ''));
    if (route === 'feed')         return viewFeed(app);
    if (route === 'login')        return viewLogin(app);
    if (route === 'register')     return viewRegister(app);
    if (route === 'new')          return viewPostForm(app, null);
    if (route === 'post' && parts[2] === 'edit') return viewPostForm(app, Number(parts[1]));
    if (route === 'post')         return viewPost(app, Number(parts[1]));
    if (route === 'user')         return viewProfile(app, parts[1]);

    app.innerHTML = '<p>Страница не найдена</p>';
}

/* ---------- Права на просмотр ---------- */

function canView(post, user) {
    if (post.visibility === 'public' || post.visibility === 'unlisted') return true;
    if (post.visibility === 'private') return user && user.id === post.authorId;
    return false;
}

/* ---------- Карточка поста ---------- */

function postCard(p) {
    const author = userById(p.authorId);
    const commentCount = db.comments.filter(c => c.postId === p.id).length;

    let label = 'публичный';
    if (p.visibility === 'unlisted') label = 'скрытый';
    if (p.visibility === 'private') label = 'приватный';

    return `
        <article class="post">
            <h2><a href="#/post/${p.id}">${esc(p.title)}</a></h2>
            <p class="meta">
                Автор: <a href="#/user/${esc(author.username)}">${esc(author.username)}</a>
                · ${fmtDate(p.createdAt)}
                · ${label}
            </p>
            <div class="body">${esc(p.body.slice(0, 220))}${p.body.length > 220 ? '…' : ''}</div>
            <div class="tags">
                ${p.tags.map(t =>
                    `<a class="tag" href="#/?tag=${encodeURIComponent(t)}">#${esc(t)}</a>`
                ).join('')}
            </div>
            <p class="meta mt">Комментариев: ${commentCount}</p>
        </article>
    `;
}

/* ---------- Главная: публичные посты ---------- */

function viewIndex(app, params) {
    const tagFilter = params.get('tag') || '';
    const sort = params.get('sort') || 'date_desc';

    let list = db.posts.filter(p => p.visibility === 'public');
    if (tagFilter) list = list.filter(p => p.tags.includes(tagFilter));

    const comparators = {
        date_desc: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
        date_asc:  (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
        title:     (a, b) => a.title.localeCompare(b.title)
    };
    list.sort(comparators[sort] || comparators.date_desc);

    const allTags = [...new Set(db.posts.flatMap(p => p.tags))].sort();

    app.innerHTML = `
        <h1>Публичные посты</h1>

        <form class="filters" id="filters">
            <label>Тег
                <select name="tag">
                    <option value="">— все —</option>
                    ${allTags.map(t => `<option value="${esc(t)}" ${t === tagFilter ? 'selected' : ''}>${esc(t)}</option>`).join('')}
                </select>
            </label>
            <label>Сортировка
                <select name="sort">
                    <option value="date_desc" ${sort === 'date_desc' ? 'selected' : ''}>Сначала новые</option>
                    <option value="date_asc"  ${sort === 'date_asc'  ? 'selected' : ''}>Сначала старые</option>
                    <option value="title"     ${sort === 'title'     ? 'selected' : ''}>По заголовку</option>
                </select>
            </label>
        </form>

        ${list.length ? list.map(postCard).join('') : '<p class="link-muted">Постов пока нет.</p>'}
    `;

    document.getElementById('filters').addEventListener('change', () => {
        const f = document.getElementById('filters');
        const q = new URLSearchParams();
        if (f.tag.value) q.set('tag', f.tag.value);
        if (f.sort.value !== 'date_desc') q.set('sort', f.sort.value);
        location.hash = '#/' + (q.toString() ? '?' + q.toString() : '');
    });
}

/* ---------- Моя лента ---------- */

function viewFeed(app) {
    const user = currentUser();
    if (!user) { location.hash = '#/login'; return; }

    const followedIds = db.follows
        .filter(f => f.followerId === user.id)
        .map(f => f.followedId);

    const allowed = [...followedIds, user.id];
    const list = db.posts
        .filter(p => allowed.includes(p.authorId) && p.visibility === 'public')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    app.innerHTML = `
        <h1>Моя лента</h1>
        ${list.length
            ? list.map(postCard).join('')
            : '<p class="link-muted">Пока нет постов от тех, на кого вы подписаны.</p>'}
    `;
}

/* ---------- Страница поста ---------- */

function viewPost(app, id) {
    const post = postById(id);
    if (!post) { app.innerHTML = '<p>Пост не найден.</p>'; return; }

    const user = currentUser();
    if (!canView(post, user)) {
        app.innerHTML = '<div class="flash err">Нет доступа к этому посту.</div>';
        return;
    }

    const author = userById(post.authorId);
    const isOwner = user && user.id === post.authorId;

    const comments = db.comments
        .filter(c => c.postId === post.id)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    let visLabel = 'публичный';
    if (post.visibility === 'unlisted') visLabel = 'скрытый';
    if (post.visibility === 'private') visLabel = 'приватный';

    app.innerHTML = `
        <article class="panel">
            <h1>${esc(post.title)}</h1>
            <p class="meta">
                Автор: <a href="#/user/${esc(author.username)}">${esc(author.username)}</a>
                · ${fmtDate(post.createdAt)}
                ${post.updatedAt !== post.createdAt ? '· изменён ' + fmtDate(post.updatedAt) : ''}
                · ${visLabel}
            </p>
            <div class="tags">
                ${post.tags.map(t =>
                    `<a class="tag" href="#/?tag=${encodeURIComponent(t)}">#${esc(t)}</a>`
                ).join('')}
            </div>
            <div class="body" style="margin-top:12px; white-space:pre-wrap;">${esc(post.body)}</div>

            ${isOwner ? `
                <div class="actions">
                    <a class="btn" href="#/post/${post.id}/edit">Редактировать</a>
                    <button class="danger" id="del-post">Удалить</button>
                </div>
            ` : ''}
        </article>

        <section class="panel">
            <h2>Комментарии (${comments.length})</h2>

            ${comments.length
                ? comments.map(c => {
                    const u = userById(c.authorId);
                    return `<div class="comment">
                        <p class="meta">
                            <a href="#/user/${esc(u.username)}">${esc(u.username)}</a>
                            · ${fmtDate(c.createdAt)}
                        </p>
                        <p>${esc(c.body)}</p>
                    </div>`;
                }).join('')
                : '<p class="link-muted">Комментариев пока нет.</p>'
            }

            ${user
                ? `<form id="comment-form" class="mt">
                       <label class="field">
                           <span>Ваш комментарий</span>
                           <textarea name="body" rows="3" required></textarea>
                       </label>
                       <button type="submit">Отправить</button>
                   </form>`
                : `<p class="link-muted mt"><a href="#/login">Войдите</a>, чтобы оставить комментарий.</p>`
            }
        </section>
    `;

    const delBtn = document.getElementById('del-post');
    if (delBtn) delBtn.onclick = () => {
        if (!confirm('Удалить пост?')) return;
        db.posts = db.posts.filter(p => p.id !== post.id);
        db.comments = db.comments.filter(c => c.postId !== post.id);
        saveDB();
        flash('Пост удалён', 'info');
        location.hash = '#/';
        render();
    };

    const form = document.getElementById('comment-form');
    if (form) form.onsubmit = e => {
        e.preventDefault();
        const body = e.target.body.value.trim();
        if (!body) return;

        db.comments.push({
            id: nextId(db.comments),
            postId: post.id,
            authorId: user.id,
            body,
            createdAt: new Date().toISOString()
        });
        saveDB();
        render();
    };
}

/* ---------- Форма поста ---------- */

function viewPostForm(app, editId) {
    const user = currentUser();
    if (!user) { location.hash = '#/login'; return; }

    let editing = null;
    if (editId) {
        editing = postById(editId);
        if (!editing || editing.authorId !== user.id) {
            app.innerHTML = '<div class="flash err">Нет доступа к этому посту.</div>';
            return;
        }
    }

    const tagsValue = editing ? esc(editing.tags.join(', ')) : '';

    app.innerHTML = `
        <h1>${editing ? 'Редактировать пост' : 'Новый пост'}</h1>
        <div class="panel">
            <form id="post-form">
                <label class="field">
                    <span>Заголовок</span>
                    <input type="text" name="title" required maxlength="200"
                           value="${editing ? esc(editing.title) : ''}">
                </label>

                <label class="field">
                    <span>Текст</span>
                    <textarea name="body" rows="10" required>${editing ? esc(editing.body) : ''}</textarea>
                </label>

                <label class="field">
                    <span>Теги (через запятую)</span>
                    <input type="text" name="tags" value="${tagsValue}"
                           placeholder="js, блог, учёба">
                </label>

                <label class="field">
                    <span>Видимость</span>
                    <select name="visibility">
                        <option value="public"   ${editing && editing.visibility === 'public'   ? 'selected' : ''}>Публичный</option>
                        <option value="unlisted" ${editing && editing.visibility === 'unlisted' ? 'selected' : ''}>Скрытый (только по ссылке)</option>
                        <option value="private"  ${editing && editing.visibility === 'private'  ? 'selected' : ''}>Приватный (только я)</option>
                    </select>
                </label>

                <button type="submit">${editing ? 'Сохранить' : 'Опубликовать'}</button>
            </form>
        </div>
    `;

    document.getElementById('post-form').onsubmit = e => {
        e.preventDefault();
        const f = e.target;

        const title = f.title.value.trim();
        const body = f.body.value.trim();
        const visibility = f.visibility.value;
        const tags = parseTags(f.tags.value);

        if (!title || !body) {
            flash('Заполните заголовок и текст', 'err');
            return;
        }

        if (editing) {
            editing.title = title;
            editing.body = body;
            editing.visibility = visibility;
            editing.tags = tags;
            editing.updatedAt = new Date().toISOString();
            flash('Изменения сохранены');
        } else {
            db.posts.push({
                id: nextId(db.posts),
                authorId: user.id,
                title,
                body,
                visibility,
                tags,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            flash('Пост опубликован');
        }

        saveDB();
        location.hash = '#/';
        render();
    };
}

/* ---------- Профиль ---------- */

function viewProfile(app, username) {
    const user = userByName(username);
    if (!user) { app.innerHTML = '<p>Пользователь не найден.</p>'; return; }

    const me = currentUser();
    const isMe = me && me.id === user.id;

    const publicPosts = db.posts
        .filter(p => p.authorId === user.id && p.visibility === 'public')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const followersCount = db.follows.filter(f => f.followedId === user.id).length;
    const followingCount = db.follows.filter(f => f.followerId === user.id).length;
    const iFollow = me && isFollowing(me.id, user.id);

    app.innerHTML = `
        <h1>Профиль: ${esc(user.username)}</h1>

        <div class="panel">
            <p>Подписчиков: <strong>${followersCount}</strong></p>
            <p>Подписок: <strong>${followingCount}</strong></p>
            <p>Публичных постов: <strong>${publicPosts.length}</strong></p>

            ${!isMe && me
                ? `<button class="mt" id="follow-btn">${iFollow ? 'Отписаться' : 'Подписаться'}</button>`
                : ''}
        </div>

        <h2 style="margin-bottom:12px;">Посты</h2>
        ${publicPosts.length
            ? publicPosts.map(postCard).join('')
            : '<p class="link-muted">Публичных постов нет.</p>'
        }
    `;

    const fb = document.getElementById('follow-btn');
    if (fb) fb.onclick = () => {
        if (iFollow) {
            db.follows = db.follows.filter(f =>
                !(f.followerId === me.id && f.followedId === user.id));
        } else {
            db.follows.push({ followerId: me.id, followedId: user.id });
        }
        saveDB();
        render();
    };
}

/* ---------- Вход ---------- */

function viewLogin(app) {
    if (currentUser()) { location.hash = '#/'; return; }

    app.innerHTML = `
        <div class="panel center-form">
            <h1>Вход</h1>
            <form id="login-form">
                <label class="field">
                    <span>Логин или e-mail</span>
                    <input type="text" name="login" required autofocus>
                </label>
                <label class="field">
                    <span>Пароль</span>
                    <input type="password" name="password" required>
                </label>
                <button type="submit">Войти</button>
            </form>
            <p class="link-muted mt">Нет аккаунта? <a href="#/register">Зарегистрироваться</a></p>
        </div>
    `;

    document.getElementById('login-form').onsubmit = e => {
        e.preventDefault();
        const f = e.target;
        const login = f.login.value.trim().toLowerCase();
        const pwd = f.password.value;

        const user = db.users.find(u =>
            u.username.toLowerCase() === login || u.email.toLowerCase() === login
        );

        if (!user || user.password !== hash(pwd)) {
            flash('Неверный логин или пароль', 'err');
            return;
        }

        db.session = { userId: user.id };
        saveDB();
        location.hash = '#/';
        render();
    };
}

/* ---------- Регистрация ---------- */

function viewRegister(app) {
    if (currentUser()) { location.hash = '#/'; return; }

    app.innerHTML = `
        <div class="panel center-form">
            <h1>Регистрация</h1>
            <form id="reg-form">
                <label class="field">
                    <span>Имя пользователя</span>
                    <input type="text" name="username" required minlength="3" maxlength="30">
                </label>
                <label class="field">
                    <span>E-mail</span>
                    <input type="email" name="email" required>
                </label>
                <label class="field">
                    <span>Пароль (мин. 6 символов)</span>
                    <input type="password" name="password" required minlength="6">
                </label>
                <button type="submit">Создать аккаунт</button>
            </form>
            <p class="link-muted mt">Уже есть аккаунт? <a href="#/login">Войти</a></p>
        </div>
    `;

    document.getElementById('reg-form').onsubmit = e => {
        e.preventDefault();
        const f = e.target;
        const username = f.username.value.trim();
        const email = f.email.value.trim().toLowerCase();
        const password = f.password.value;

        if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
            flash('Такое имя уже занято', 'err');
            return;
        }
        if (db.users.some(u => u.email.toLowerCase() === email)) {
            flash('Такая почта уже зарегистрирована', 'err');
            return;
        }

        const user = {
            id: nextId(db.users),
            username,
            email,
            password: hash(password)
        };

        db.users.push(user);
        db.session = { userId: user.id };
        saveDB();

        location.hash = '#/';
        render();
    };
}

/* ---------- Старт ---------- */

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', () => {
    loadDB();
    seed();
    render();
});