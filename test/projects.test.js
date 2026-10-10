// Future Projects — a freeform "someday/maybe" list, independent of the
// budget. Title, status (someday/planning/in-progress/complete),
// estimated/actual price, and an estimated date.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { STORAGE_KEY, plain, v7Backup, bootWith, loadApp } = require('./helpers');
const projectIds = (h) => plain(h.get('state').futureProjects.map(p => p.id));

describe('fresh install', () => {
  test('starts with an empty project list', () => {
    const h = loadApp();
    assert.deepEqual(plain(h.get('state').futureProjects), []);
  });
});

describe('migration', () => {
  test('a v8 backup (no futureProjects field) gets an empty list added, nothing else disturbed', () => {
    const old = v7Backup({ version: 8 });
    old.accountDefs = loadApp().app.freshState().accountDefs;
    const h = bootWith(old);
    const s = h.get('state');
    assert.deepEqual(plain(s.futureProjects), []);
    assert.equal(s.accounts.checking, 11747, 'migrating to v9 must not touch unrelated data');
  });
  test('a pre-v8 backup reaches the current version with an empty project list too', () => {
    const h = bootWith(v7Backup({ version: 5 }));
    assert.deepEqual(plain(h.get('state').futureProjects), []);
  });
});

describe('addFutureProject', () => {
  test('adds a "New project" defaulting to Someday/Maybe with no prices/date, and persists it', () => {
    const h = loadApp();
    h.app.addFutureProject();
    const s = h.get('state');
    assert.equal(s.futureProjects.length, 1);
    const p = s.futureProjects[0];
    assert.equal(p.title, 'New project');
    assert.equal(p.status, 'someday');
    assert.equal(p.estimatedPrice, null);
    assert.equal(p.actualPrice, null);
    assert.equal(p.estimatedDate, null);
    assert.equal(JSON.parse(h.localStorage.getItem(STORAGE_KEY)).futureProjects.length, 1, 'persisted immediately');
  });
  test('rapid-fire adds (same millisecond) still get distinct ids and a strictly increasing order', () => {
    const h = loadApp();
    for (let i = 0; i < 20; i++) h.app.addFutureProject();
    const projects = h.get('state').futureProjects;
    assert.equal(new Set(projects.map(p => p.id)).size, 20, 'ids must not collide even added back-to-back');
    const orders = plain(projects.map(p => p.order));
    assert.deepEqual(orders, [...orders].sort((a,b) => a-b), 'order must already be ascending');
    assert.equal(new Set(orders).size, 20, 'order values must not collide either');
  });
});

describe('editing', () => {
  function withProject(){
    const h = loadApp();
    h.app.addFutureProject();
    return { h, id: h.get('state').futureProjects[0].id };
  }
  test('renameFutureProject changes the title and persists', () => {
    const { h, id } = withProject();
    h.app.renameFutureProject(id, 'Repaint the garage');
    assert.equal(h.get('state').futureProjects[0].title, 'Repaint the garage');
    assert.equal(JSON.parse(h.localStorage.getItem(STORAGE_KEY)).futureProjects[0].title, 'Repaint the garage');
  });
  test('an unknown id is a harmless no-op for every setter', () => {
    const { h } = withProject();
    for (const call of [
      () => h.app.renameFutureProject('ghost', 'x'),
      () => h.app.setFutureProjectStatus('ghost', 'planning'),
      () => h.app.setFutureProjectEstimatedPrice('ghost', '10'),
      () => h.app.setFutureProjectActualPrice('ghost', '10'),
      () => h.app.setFutureProjectDate('ghost', '2027-01-01'),
    ]) assert.doesNotThrow(call);
  });

  describe('status', () => {
    test('setFutureProjectStatus accepts each of the four statuses and persists', () => {
      const { h, id } = withProject();
      for (const status of ['someday', 'planning', 'inprogress', 'complete']) {
        h.app.setFutureProjectStatus(id, status);
        assert.equal(h.get('state').futureProjects[0].status, status);
        assert.equal(JSON.parse(h.localStorage.getItem(STORAGE_KEY)).futureProjects[0].status, status);
      }
    });
    test('an invalid status value falls back to Someday/Maybe rather than storing garbage', () => {
      const { h, id } = withProject();
      h.app.setFutureProjectStatus(id, 'bogus');
      assert.equal(h.get('state').futureProjects[0].status, 'someday');
    });
    test('PROJECT_STATUSES has exactly the four required options in order, with a label for each', () => {
      const h = loadApp();
      assert.deepEqual(plain(h.get('PROJECT_STATUSES')), [
        { id: 'someday', label: 'Someday/Maybe' },
        { id: 'planning', label: 'Planning' },
        { id: 'inprogress', label: 'In Progress' },
        { id: 'complete', label: 'Complete' },
      ]);
    });
  });

  describe('prices', () => {
    test('estimated and actual price are stored as whole dollars, independently of each other', () => {
      const { h, id } = withProject();
      h.app.setFutureProjectEstimatedPrice(id, '499.60');
      h.app.setFutureProjectActualPrice(id, '512.20');
      const p = h.get('state').futureProjects[0];
      assert.equal(p.estimatedPrice, 500);
      assert.equal(p.actualPrice, 512);
    });
    test('clearing a price field sets it back to null, not 0 (0 is a real possible price)', () => {
      const { h, id } = withProject();
      h.app.setFutureProjectEstimatedPrice(id, '500');
      h.app.setFutureProjectEstimatedPrice(id, '');
      assert.equal(h.get('state').futureProjects[0].estimatedPrice, null);
    });
    test('junk input becomes 0, not null (matches wholeDollar() used everywhere else in the app)', () => {
      const { h, id } = withProject();
      h.app.setFutureProjectEstimatedPrice(id, 'abc');
      assert.equal(h.get('state').futureProjects[0].estimatedPrice, 0);
    });
  });

  describe('estimated date', () => {
    test('stores the date string and persists', () => {
      const { h, id } = withProject();
      h.app.setFutureProjectDate(id, '2027-06-15');
      assert.equal(h.get('state').futureProjects[0].estimatedDate, '2027-06-15');
    });
    test('clearing the date sets it back to null', () => {
      const { h, id } = withProject();
      h.app.setFutureProjectDate(id, '2027-06-15');
      h.app.setFutureProjectDate(id, '');
      assert.equal(h.get('state').futureProjects[0].estimatedDate, null);
    });
  });

  test('removeFutureProject removes exactly that project', () => {
    const h = loadApp();
    h.app.addFutureProject();
    const keepId = h.get('state').futureProjects[0].id;
    h.app.addFutureProject();
    const removeId = h.get('state').futureProjects[1].id;
    h.app.removeFutureProject(removeId);
    assert.deepEqual(projectIds(h), [keepId]);
  });
});

describe('title lock UX (mirrors account/category title editing)', () => {
  test('renderProjectTitleField shows a locked, escaped span by default', () => {
    const h = loadApp();
    const html = h.app.renderProjectTitleField('p1', '<script>evil</script>');
    assert.ok(html.includes('title-locked'));
    assert.ok(!html.includes('<script>evil</script>'), 'must be HTML-escaped');
    assert.ok(html.includes('&lt;script&gt;'));
  });
  test('unlockProjectTitle switches that project to an editable input', () => {
    const h = loadApp();
    h.app.addFutureProject();
    const id = h.get('state').futureProjects[0].id;
    h.app.unlockProjectTitle(id);
    assert.ok(h.app.renderProjectTitleField(id, 'x').includes('title-input'));
  });
  test('lockProjectTitle saves a non-empty value and ignores a blank one', () => {
    const h = loadApp();
    h.app.addFutureProject();
    const id = h.get('state').futureProjects[0].id;
    h.app.lockProjectTitle(id, '  Build a deck  ');
    assert.equal(h.get('state').futureProjects[0].title, 'Build a deck', 'trimmed');
    h.app.lockProjectTitle(id, '   ');
    assert.equal(h.get('state').futureProjects[0].title, 'Build a deck', 'blank input must not overwrite the title');
  });
});

describe('rendering', () => {
  test('the Projects tab renders with no projects, with one in every status, and after deleting the last one', () => {
    const h = loadApp();
    assert.doesNotThrow(() => h.app.showTab('projects'));
    h.app.addFutureProject();
    const id = h.get('state').futureProjects[0].id;
    for (const status of ['someday', 'planning', 'inprogress', 'complete']) {
      h.app.setFutureProjectStatus(id, status);
      assert.doesNotThrow(() => h.app.renderProjects(), status);
    }
    h.app.removeFutureProject(id);
    assert.doesNotThrow(() => h.app.renderProjects());
  });
  test('rendering includes the status select, both price fields, and the date field for each project', () => {
    const h = loadApp();
    h.app.addFutureProject();
    h.app.renderProjects();
    const container = h.app.document.getElementById('projects-list');
    const html = container.innerHTML;
    assert.match(html, /data-field-key="projstatus:/);
    assert.match(html, /data-field-key="projest:/);
    assert.match(html, /data-field-key="projact:/);
    assert.match(html, /data-field-key="projdate:/);
  });
  test('no notes field is rendered anywhere', () => {
    const h = loadApp();
    h.app.addFutureProject();
    h.app.renderProjects();
    const html = h.app.document.getElementById('projects-list').innerHTML;
    assert.ok(!html.includes('project-notes'), 'the notes input is gone');
    assert.ok(!html.includes('projnotes:'), 'and so is its field key');
  });
  test('each controls-row field carries the class its column width is keyed off', () => {
    // The two-line layout sizes Type, the two money fields, the status
    // select and the date input into separate columns, and it targets them
    // by these classes. Dropping one doesn't break any behaviour — the
    // field just silently stops filling its column and the row goes ragged,
    // which no other test here would notice.
    const h = loadApp();
    h.app.addFutureProject();
    h.app.renderProjects();
    const html = h.app.document.getElementById('projects-list').innerHTML;
    assert.match(html, /class="proj-field proj-field-type"/, 'Type field');
    assert.equal((html.match(/class="proj-field proj-field-money"/g) || []).length, 2, 'Est. and Actual');
    assert.match(html, /class="bc-sel"/, 'status select');
    assert.match(html, /class="bc-date"/, 'date input');
  });
  test('every other tab still renders fine with projects present', () => {
    const h = loadApp();
    h.app.addFutureProject();
    for (const tab of ['dashboard', 'weekly', 'monthly', 'budget', 'projects']) {
      assert.doesNotThrow(() => h.app.showTab(tab), tab);
    }
  });
});

describe('sorting', () => {
  function withThree(h){
    h.app.addFutureProject();
    h.app.renameFutureProject(h.get('state').futureProjects[0].id, 'Zebra deck');
    h.app.setFutureProjectStatus(h.get('state').futureProjects[0].id, 'complete');
    h.app.setFutureProjectEstimatedPrice(h.get('state').futureProjects[0].id, '300');
    h.app.setFutureProjectDate(h.get('state').futureProjects[0].id, '2027-01-01');

    h.app.addFutureProject();
    h.app.renameFutureProject(h.get('state').futureProjects[1].id, 'Attic garden');
    h.app.setFutureProjectStatus(h.get('state').futureProjects[1].id, 'someday');
    h.app.setFutureProjectEstimatedPrice(h.get('state').futureProjects[1].id, '100');
    // no date set — must sort last regardless of direction

    h.app.addFutureProject();
    h.app.renameFutureProject(h.get('state').futureProjects[2].id, 'Mudroom');
    h.app.setFutureProjectStatus(h.get('state').futureProjects[2].id, 'planning');
    h.app.setFutureProjectEstimatedPrice(h.get('state').futureProjects[2].id, '200');
    h.app.setFutureProjectDate(h.get('state').futureProjects[2].id, '2026-06-01');
  }
  const titlesIn = (h) => plain(h.app.sortProjects(h.app.filterProjects(h.get('state').futureProjects)).map(p => p.title));

  test('defaults to Priority, ascending — which starts out equal to insertion order for anything never dragged', () => {
    const h = loadApp();
    assert.equal(h.get('projectSortField'), 'priority');
    assert.equal(h.get('projectSortDir'), 'asc');
    withThree(h);
    assert.deepEqual(titlesIn(h), ['Zebra deck', 'Attic garden', 'Mudroom']);
  });
  test('sort by Date added stays insertion order too, independently of priority', () => {
    const h = loadApp();
    withThree(h);
    h.app.setProjectSort('added');
    assert.deepEqual(titlesIn(h), ['Zebra deck', 'Attic garden', 'Mudroom']);
  });
  test('sort by Priority reflects a drag-reorder (reorderProjectsByIds), not just insertion order', () => {
    const h = loadApp();
    withThree(h);
    const [a, b, c] = h.get('state').futureProjects.map(p => p.id);
    h.app.reorderProjectsByIds([c, a, b]);
    h.app.setProjectSort('priority');
    assert.deepEqual(titlesIn(h), ['Mudroom', 'Zebra deck', 'Attic garden']);
  });
  test('sort by Title is alphabetical, and the direction toggle reverses it', () => {
    const h = loadApp();
    withThree(h);
    h.app.setProjectSort('title');
    assert.deepEqual(titlesIn(h), ['Attic garden', 'Mudroom', 'Zebra deck']);
    h.app.toggleProjectSortDir();
    assert.deepEqual(titlesIn(h), ['Zebra deck', 'Mudroom', 'Attic garden']);
    h.app.toggleProjectSortDir(); // back to ascending for the rest of the suite's sanity
    assert.deepEqual(titlesIn(h), ['Attic garden', 'Mudroom', 'Zebra deck']);
  });
  test('sort by Status follows the someday -> planning -> in progress -> complete lifecycle, not alphabetical order', () => {
    const h = loadApp();
    withThree(h);
    h.app.setProjectSort('status');
    assert.deepEqual(titlesIn(h), ['Attic garden', 'Mudroom', 'Zebra deck']); // someday, planning, complete
  });
  test('sort by Estimated price is numeric low-to-high, then high-to-low when toggled', () => {
    const h = loadApp();
    withThree(h);
    h.app.setProjectSort('estimatedPrice');
    assert.deepEqual(titlesIn(h), ['Attic garden', 'Mudroom', 'Zebra deck']); // 100, 200, 300
    h.app.toggleProjectSortDir();
    assert.deepEqual(titlesIn(h), ['Zebra deck', 'Mudroom', 'Attic garden']);
  });
  test('sort by Estimated date puts the project with no date last in EITHER direction', () => {
    const h = loadApp();
    withThree(h);
    h.app.setProjectSort('estimatedDate');
    assert.deepEqual(titlesIn(h), ['Mudroom', 'Zebra deck', 'Attic garden']); // 2026-06, 2027-01, (none)
    h.app.toggleProjectSortDir();
    assert.deepEqual(titlesIn(h), ['Zebra deck', 'Mudroom', 'Attic garden'], 'blank date stays last even descending');
  });
});

describe('filtering', () => {
  function withThree(h){
    h.app.addFutureProject();
    h.app.renameFutureProject(h.get('state').futureProjects[0].id, 'Paint the garage');
    h.app.setFutureProjectStatus(h.get('state').futureProjects[0].id, 'planning');

    h.app.addFutureProject();
    h.app.renameFutureProject(h.get('state').futureProjects[1].id, 'Plant a garden');
    h.app.setFutureProjectStatus(h.get('state').futureProjects[1].id, 'someday');

    h.app.addFutureProject();
    h.app.renameFutureProject(h.get('state').futureProjects[2].id, 'New deck');
    h.app.setFutureProjectStatus(h.get('state').futureProjects[2].id, 'planning');
  }
  const titlesIn = (h) => plain(h.app.sortProjects(h.app.filterProjects(h.get('state').futureProjects)).map(p => p.title));

  test('defaults to showing everything (status "all", empty search)', () => {
    const h = loadApp();
    withThree(h);
    assert.equal(titlesIn(h).length, 3);
  });
  test('status filter shows only matching projects', () => {
    const h = loadApp();
    withThree(h);
    h.app.setProjectFilterStatus('planning');
    assert.deepEqual(titlesIn(h), ['Paint the garage', 'New deck']);
  });
  test('search matches the title, case-insensitively', () => {
    const h = loadApp();
    withThree(h);
    h.app.setProjectFilterSearch('GARAGE');
    assert.deepEqual(titlesIn(h), ['Paint the garage']);
  });
  test('search matches titles only — notes are gone, so nothing invisible can match', () => {
    const h = loadApp();
    withThree(h);
    // 'primer' was a notes word back when notes existed and searching it
    // returned a project whose title never mentioned it.
    h.app.setProjectFilterSearch('primer');
    assert.deepEqual(titlesIn(h), []);
  });
  test('status filter and search combine (both must match)', () => {
    const h = loadApp();
    withThree(h);
    h.app.setProjectFilterStatus('planning');
    h.app.setProjectFilterSearch('deck');
    assert.deepEqual(titlesIn(h), ['New deck']);
  });
  test('a filter that matches nothing shows a distinct "no match" message, not "None yet"', () => {
    const h = loadApp();
    withThree(h);
    h.app.setProjectFilterSearch('nonexistent project name');
    h.app.renderProjects();
    const html = h.app.document.getElementById('projects-list').innerHTML;
    assert.match(html, /No projects match your filter/);
  });
  test('an empty list (no projects at all) still shows "None yet", not the filter message', () => {
    const h = loadApp();
    h.app.renderProjects();
    const html = h.app.document.getElementById('projects-list').innerHTML;
    assert.match(html, /None yet/);
  });
});

describe('toolbar rendering', () => {
  test('the toolbar renders a sort dropdown, direction button, status filter, and search box', () => {
    const h = loadApp();
    h.app.renderProjects();
    const html = h.app.document.getElementById('projects-toolbar').innerHTML;
    assert.match(html, /onchange="setProjectSort\(/);
    assert.match(html, /onclick="toggleProjectSortDir\(\)"/);
    assert.match(html, /onchange="setProjectFilterStatus\(/);
    assert.match(html, /data-field-key="projsearch"/);
  });
  test('the toolbar reflects the currently selected sort field and direction', () => {
    const h = loadApp();
    h.app.setProjectSort('status');
    h.app.renderProjects();
    let html = h.app.document.getElementById('projects-toolbar').innerHTML;
    assert.match(html, /<option value="status" selected>/);
    h.app.toggleProjectSortDir();
    h.app.renderProjects(); // toggleProjectSortDir defers its render; force it now rather than waiting a tick
    html = h.app.document.getElementById('projects-toolbar').innerHTML;
    assert.match(html, />&darr;</, 'button shows the down arrow once switched to descending');
  });
});

describe('persistence round-trip', () => {
  test('a fully-filled-in project survives a save -> reload cycle unchanged', () => {
    const first = loadApp();
    first.app.addFutureProject();
    const id = first.get('state').futureProjects[0].id;
    first.app.renameFutureProject(id, 'Plant a garden');
    first.app.setFutureProjectStatus(id, 'inprogress');
    first.app.setFutureProjectType(id, 'Home Improvement');
    first.app.setFutureProjectEstimatedPrice(id, '150');
    first.app.setFutureProjectActualPrice(id, '162');
    first.app.setFutureProjectDate(id, '2027-05-01');

    const second = loadApp({ localStorageSeed: first.localStorage._dump() });
    assert.deepEqual(plain(second.get('state').futureProjects), plain(first.get('state').futureProjects));
    assert.deepEqual(plain(second.get('state').projectTypes), plain(first.get('state').projectTypes));
  });
});

describe('Type (dropdown + free entry)', () => {
  test('DEFAULT_PROJECT_TYPES has exactly the five requested options', () => {
    const h = loadApp();
    assert.deepEqual(plain(h.get('DEFAULT_PROJECT_TYPES')), ['Home Improvement', 'Vacation', 'Vehicle', 'Rental Property', 'Other']);
    assert.deepEqual(plain(h.get('state').projectTypes), ['Home Improvement', 'Vacation', 'Vehicle', 'Rental Property', 'Other']);
  });
  test('picking an existing type just sets it, without duplicating it in the list', () => {
    const h = loadApp();
    h.app.addFutureProject();
    const id = h.get('state').futureProjects[0].id;
    h.app.setFutureProjectType(id, 'Vacation');
    assert.equal(h.get('state').futureProjects[0].type, 'Vacation');
    assert.equal(h.get('state').projectTypes.filter(t => t === 'Vacation').length, 1);
  });
  test('typing a brand-new value sets it on the project AND adds it as a suggestion for every other project', () => {
    const h = loadApp();
    h.app.addFutureProject();
    const id = h.get('state').futureProjects[0].id;
    h.app.setFutureProjectType(id, 'Boat');
    assert.equal(h.get('state').futureProjects[0].type, 'Boat');
    assert.ok(h.get('state').projectTypes.includes('Boat'));
    assert.equal(JSON.parse(h.localStorage.getItem(STORAGE_KEY)).projectTypes.includes('Boat'), true, 'persisted immediately');
  });
  test('whitespace is trimmed, and an empty value clears the type rather than adding a blank suggestion', () => {
    const h = loadApp();
    h.app.addFutureProject();
    const id = h.get('state').futureProjects[0].id;
    h.app.setFutureProjectType(id, '  Boat  ');
    assert.equal(h.get('state').futureProjects[0].type, 'Boat');
    h.app.setFutureProjectType(id, '   ');
    assert.equal(h.get('state').futureProjects[0].type, null);
    assert.ok(!h.get('state').projectTypes.includes(''));
  });
  test('a type typed on one project is immediately a suggestion when editing another', () => {
    const h = loadApp();
    h.app.addFutureProject();
    h.app.setFutureProjectType(h.get('state').futureProjects[0].id, 'Boat');
    h.app.addFutureProject();
    assert.ok(h.get('state').projectTypes.includes('Boat'), 'second project\'s datalist draws from the same shared list');
  });
  test('rendering ties each project\'s type input to the shared datalist, with the current value filled in', () => {
    const h = loadApp();
    h.app.addFutureProject();
    const id = h.get('state').futureProjects[0].id;
    h.app.setFutureProjectType(id, 'Vehicle');
    h.app.renderProjects();
    const listHtml = h.app.document.getElementById('projects-list').innerHTML;
    assert.match(listHtml, /list="project-types-datalist"/);
    assert.match(listHtml, /data-field-key="projtype:[^"]*"\s+value="Vehicle"/);
    const toolbarHtml = h.app.document.getElementById('projects-toolbar').innerHTML;
    assert.match(toolbarHtml, /<datalist id="project-types-datalist">/);
    assert.match(toolbarHtml, /<option value="Vehicle">/);
  });
});

describe('migration backfills type and priority for projects that predate them', () => {
  test('a futureProjects array saved before this version gets type:null and priority matching its existing array order', () => {
    const old = v7Backup({ version: 9 });
    old.accountDefs = loadApp().app.freshState().accountDefs;
    old.projectTypes = undefined;
    old.futureProjects = [
      { id: 'a', title: 'First', notes: '', status: 'someday', estimatedPrice: null, actualPrice: null, estimatedDate: null },
      { id: 'b', title: 'Second', notes: '', status: 'planning', estimatedPrice: null, actualPrice: null, estimatedDate: null },
    ];
    const h = bootWith(old);
    const s = h.get('state');
    assert.deepEqual(plain(s.projectTypes), ['Home Improvement', 'Vacation', 'Vehicle', 'Rental Property', 'Other']);
    assert.equal(s.futureProjects[0].type, null);
    assert.equal(s.futureProjects[0].priority, 0);
    assert.equal(s.futureProjects[1].priority, 1);
  });
  test('a project that already has type/priority set keeps them untouched', () => {
    const old = v7Backup({ version: 9 });
    old.accountDefs = loadApp().app.freshState().accountDefs;
    old.futureProjects = [{ id: 'a', title: 'First', notes: '', status: 'someday', type: 'Vacation', priority: 7, estimatedPrice: null, actualPrice: null, estimatedDate: null }];
    const h = bootWith(old);
    assert.equal(h.get('state').futureProjects[0].type, 'Vacation');
    assert.equal(h.get('state').futureProjects[0].priority, 7);
  });
  test('notes saved before the field was removed are dropped, not left as a dead key', () => {
    const old = v7Backup({ version: 10 });
    old.accountDefs = loadApp().app.freshState().accountDefs;
    old.futureProjects = [{ id: 'a', title: 'First', notes: 'buy primer first', status: 'someday', type: null, priority: 0, estimatedPrice: null, actualPrice: null, estimatedDate: null }];
    const h = bootWith(old);
    const p = h.get('state').futureProjects[0];
    assert.equal(p.title, 'First', 'the rest of the project is untouched');
    assert.ok(!('notes' in plain(p)), 'notes is gone from state');
    const saved = JSON.parse(h.localStorage.getItem(STORAGE_KEY));
    assert.ok(!('notes' in saved.futureProjects[0]), 'and gone from what gets persisted/exported');
  });
});

describe('Priority and drag-to-reorder', () => {
  test('addFutureProject assigns an incrementing priority, matching insertion order', () => {
    const h = loadApp();
    h.app.addFutureProject();
    h.app.addFutureProject();
    h.app.addFutureProject();
    assert.deepEqual(plain(h.get('state').futureProjects.map(p => p.priority)), [0, 1, 2]);
  });

  describe('reorderProjectsByIds (the pure logic a drop commits)', () => {
    function withThree(h){
      h.app.addFutureProject();
      h.app.addFutureProject();
      h.app.addFutureProject();
      const [a, b, c] = h.get('state').futureProjects.map(p => p.id);
      h.app.renameFutureProject(a, 'A');
      h.app.renameFutureProject(b, 'B');
      h.app.renameFutureProject(c, 'C');
      return { a, b, c };
    }
    test('reorders to match the given id order and renumbers priority 0..N to match', () => {
      const h = loadApp();
      const { a, b, c } = withThree(h);
      h.app.reorderProjectsByIds([c, a, b]);
      const s = h.get('state');
      assert.deepEqual(plain(s.futureProjects.map(p => p.title)), ['C', 'A', 'B']);
      assert.deepEqual(plain(s.futureProjects.map(p => p.priority)), [0, 1, 2]);
    });
    test('persists immediately', () => {
      const h = loadApp();
      const { a, b, c } = withThree(h);
      h.app.reorderProjectsByIds([c, b, a]);
      assert.deepEqual(JSON.parse(h.localStorage.getItem(STORAGE_KEY)).futureProjects.map(p => p.title), ['C', 'B', 'A']);
    });
    test('an id list missing a project (e.g. a stale read) appends it rather than losing it', () => {
      const h = loadApp();
      const { a, b, c } = withThree(h);
      h.app.reorderProjectsByIds([c, a]); // b omitted
      assert.deepEqual(plain(h.get('state').futureProjects.map(p => p.title)), ['C', 'A', 'B']);
    });
    test('an empty list is a no-op rather than deleting everything', () => {
      const h = loadApp();
      withThree(h);
      h.app.reorderProjectsByIds([]);
      assert.equal(h.get('state').futureProjects.length, 3);
    });
  });

  describe('projectDragEnabled — drag is only offered where it can be shown correctly', () => {
    test('enabled in the default view: sorted by Priority, ascending, no filter', () => {
      const h = loadApp();
      assert.equal(h.app.projectDragEnabled(), true);
    });
    test('disabled when not sorted by Priority', () => {
      const h = loadApp();
      h.app.setProjectSort('title');
      assert.equal(h.app.projectDragEnabled(), false);
    });
    test('disabled sorted by Priority descending (a drop would immediately re-reverse itself on render)', () => {
      const h = loadApp();
      h.app.toggleProjectSortDir();
      assert.equal(h.app.projectDragEnabled(), false);
    });
    test('disabled while a status filter is active', () => {
      const h = loadApp();
      h.app.setProjectFilterStatus('planning');
      assert.equal(h.app.projectDragEnabled(), false);
    });
    test('disabled while a search filter is active', () => {
      const h = loadApp();
      h.app.setProjectFilterSearch('deck');
      assert.equal(h.app.projectDragEnabled(), false);
    });
    test('the drag handle only renders in markup when dragging is enabled', () => {
      const h = loadApp();
      h.app.addFutureProject();
      h.app.renderProjects();
      assert.match(h.app.document.getElementById('projects-list').innerHTML, /class="drag-handle"/);
      h.app.setProjectFilterStatus('planning');
      h.app.renderProjects();
      assert.ok(!h.app.document.getElementById('projects-list').innerHTML.includes('class="drag-handle"'));
    });
  });

  test('startProjectDrag is a no-op when dragging is disabled (does not set drag state)', () => {
    const h = loadApp();
    h.app.addFutureProject();
    const id = h.get('state').futureProjects[0].id;
    h.app.setProjectFilterStatus('planning'); // disables dragging
    let prevented = false;
    h.app.startProjectDrag({ pointerId: 1, currentTarget: h.app.document.body, preventDefault: () => { prevented = true; } }, id);
    assert.equal(prevented, false, 'must bail out before touching the event at all');
  });
});

describe('Tab at the end of the list auto-adds a new project', () => {
  function fakeTabEvent(shiftKey){
    const e = { key: 'Tab', shiftKey: !!shiftKey, defaultPrevented: false };
    e.preventDefault = () => { e.defaultPrevented = true; };
    return e;
  }
  test('Tab on the last field of the last project adds a new one and prevents the default Tab', () => {
    const h = loadApp();
    h.app.addFutureProject();
    const id = h.get('state').futureProjects[0].id;
    const e = fakeTabEvent();
    h.app.handleProjectLastFieldTab(e, id);
    assert.equal(e.defaultPrevented, true);
    assert.equal(h.get('state').futureProjects.length, 2);
  });
  test('Shift+Tab does not add a project (only forward Tab does)', () => {
    const h = loadApp();
    h.app.addFutureProject();
    const id = h.get('state').futureProjects[0].id;
    h.app.handleProjectLastFieldTab(fakeTabEvent(true), id);
    assert.equal(h.get('state').futureProjects.length, 1);
  });
  test('Tab on a non-last project does nothing special', () => {
    const h = loadApp();
    h.app.addFutureProject();
    h.app.addFutureProject();
    const firstId = h.get('state').futureProjects[0].id;
    h.app.handleProjectLastFieldTab(fakeTabEvent(), firstId);
    assert.equal(h.get('state').futureProjects.length, 2);
  });
  test('any other key is ignored entirely', () => {
    const h = loadApp();
    h.app.addFutureProject();
    const id = h.get('state').futureProjects[0].id;
    const e = { key: 'Enter', shiftKey: false, preventDefault: () => { throw new Error('should not be called'); } };
    assert.doesNotThrow(() => h.app.handleProjectLastFieldTab(e, id));
    assert.equal(h.get('state').futureProjects.length, 1);
  });
  test('disabled while a filter is active that still matches (isolates the filter guard from the "still last" check)', () => {
    const h = loadApp();
    h.app.addFutureProject();
    const id = h.get('state').futureProjects[0].id;
    h.app.setProjectFilterSearch('New project'); // matches, so it's still the (only, last) visible row
    assert.deepEqual(plain(h.app.filterProjects(h.get('state').futureProjects).map(p => p.id)), [id], 'sanity: filter is active but does not remove the row');
    h.app.handleProjectLastFieldTab(fakeTabEvent(), id);
    assert.equal(h.get('state').futureProjects.length, 1);
  });
  test('a filter that removes the row entirely also blocks it, via a different path (nothing left to be "last")', () => {
    const h = loadApp();
    h.app.addFutureProject();
    const id = h.get('state').futureProjects[0].id;
    h.app.setProjectFilterSearch('nothing will match this');
    h.app.handleProjectLastFieldTab(fakeTabEvent(), id);
    assert.equal(h.get('state').futureProjects.length, 1);
  });
  test('the newly added project\'s title ends up unlocked and unlock-focused, continuing the keyboard flow', () => {
    const h = loadApp();
    h.app.addFutureProject();
    const id = h.get('state').futureProjects[0].id;
    h.app.handleProjectLastFieldTab(fakeTabEvent(), id);
    const newId = h.get('state').futureProjects[1].id;
    assert.match(h.app.renderProjectTitleField(newId, 'New project'), /title-input/, 'addFutureProject already unlocks the new title for typing');
  });
  test('the keydown handler is wired to the Date field, the last stop in the row', () => {
    const h = loadApp();
    h.app.addFutureProject();
    h.app.renderProjects();
    const html = h.app.document.getElementById('projects-list').innerHTML;
    const dateField = html.slice(html.indexOf('class="bc-date"'), html.indexOf('>', html.indexOf('class="bc-date"')));
    assert.match(dateField, /onkeydown="handleProjectLastFieldTab\(/);
    assert.equal((html.match(/handleProjectLastFieldTab\(/g) || []).length, 1, 'only the date field fires it — nothing earlier in the row');
  });
});
