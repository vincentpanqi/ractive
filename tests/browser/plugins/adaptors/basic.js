import { fire } from 'simulant';
import Model from '../../../helpers/Model';
import { onWarn, initModule } from '../../../helpers/test-config';
import { test } from 'qunit';

export default function() {
	initModule( 'plugins/adaptors/basic.js' );

	const adaptor = Model.adaptor;

	function Foo ( content ) {
		this.content = content;
	}

	const fooAdaptor = {
		filter ( object ) {
			return object instanceof Foo;
		},
		wrap ( ractive, foo ) {
			const wrapper = {
				get () {
					return foo.content;
				},
				teardown () {
					delete foo._wrapper;
				}
			};
			foo._wrapper = wrapper;
			return wrapper;
		}
	};

	test( 'Adaptors can change data as it is .set() (#442)', t => {
		const model = new Model({
			foo: 'BAR',
			percent: 150
		});

		model.transform( 'foo', ( newValue ) => {
			return newValue.toLowerCase();
		});

		model.transform( 'percent', ( newValue ) => {
			return Math.min( 100, Math.max( 0, newValue ) );
		});

		const ractive = new Ractive({
			el: fixture,
			template: '<p>{{model.foo}}</p><p>{{model.percent}}</p>',
			data: { model },
			adapt: [ adaptor ]
		});

		t.htmlEqual( fixture.innerHTML, '<p>bar</p><p>100</p>' );

		ractive.set( 'model.foo', 'BAZ' );
		ractive.set( 'model.percent', -20 );
		t.htmlEqual( fixture.innerHTML, '<p>baz</p><p>0</p>' );

		ractive.set( 'model', {
			foo: 'QUX',
			percent: 50
		});
		t.htmlEqual( fixture.innerHTML, '<p>qux</p><p>50</p>' );
	});

	test( 'ractive.reset() calls are forwarded to wrappers if the root data object is wrapped', t => {
		onWarn( msg => t.ok( /plain JavaScript object/.test( msg ) ) );

		let model = new Model({
			foo: 'BAR',
			unwanted: 'here'
		});

		model.transform( 'foo', ( newValue ) => {
			return newValue.toLowerCase();
		});

		const ractive = new Ractive({
			el: fixture,
			template: '<p>{{foo}}</p>{{unwanted}}',
			data: model,
			adapt: [ adaptor ]
		});

		ractive.reset({ foo: 'BAZ' });
		t.htmlEqual( fixture.innerHTML, '<p>baz</p>' );

		model = new Model({ foo: 'QUX' });

		model.transform( 'foo', ( newValue ) => {
			return newValue.toLowerCase();
		});

		ractive.reset( model );
		t.htmlEqual( fixture.innerHTML, '<p>qux</p>' );
	});

	test( 'If a wrapper\'s reset() method returns false, it should be torn down (#467)', t => {
		const model1 = new Model({
			foo: 'bar'
		});

		const model2 = new Model({
			foo: 'baz'
		});

		const ractive = new Ractive({
			el: fixture,
			template: '<p>{{model.foo}}</p>',
			data: { model: model1 },
			adapt: [ adaptor ]
		});

		t.htmlEqual( fixture.innerHTML, '<p>bar</p>' );

		ractive.set( 'model', model2 );
		t.htmlEqual( fixture.innerHTML, '<p>baz</p>' );
	});

	test( 'A string can be supplied instead of an array for the `adapt` option (if there\'s only one adaptor listed', t => {
		const FooAdaptor = {
			filter () {},
			wrap () {}
		};

		const Subclass = Ractive.extend({ adapt: 'Foo', adaptors: { Foo: FooAdaptor }, modifyArrays: false });
		const instance = new Subclass();

		t.deepEqual( instance.viewmodel.adaptors, [FooAdaptor] );
	});

	test( 'Original values are passed to event handlers (#945)', t => {
		t.expect( 2 );

		const ractive = new Ractive({
			el: fixture,
			template: '{{#with model}}<button on-click="@this.fire("select", event, this)">{{foo}}</button>{{/with}}',
			data: {
				model: new Model({ foo: 'bar' })
			},
			adapt: [ adaptor ]
		});

		t.htmlEqual( fixture.innerHTML, '<button>bar</button>' );

		ractive.on( 'select', ( event, model ) => {
			t.ok( model instanceof Model );
		});

		fire( ractive.find( 'button' ), 'click' );
	});

	test( 'Adaptor teardown is called when used in a component (#1190)', t => {
		const done = t.async();

		function Wrapped () {}

		let torndown = 0;

		const adaptor = {
			filter: obj => obj instanceof Wrapped,
			wrap: () => {
				return {
					get: () => ({ foo: 'bar' }),
					reset: () => false,
					teardown: () => torndown++
				};
			}
		};

		const ractive = new Ractive({
			el: fixture,
			template: '<Component/>',
			components: {
				Component: Ractive.extend({
					template: '{{wrapped.foo}}',
					data: () => ({
						wrapped: new Wrapped()
					}),
					adapt: [ adaptor ]
				})
			}

		});

		t.htmlEqual( fixture.innerHTML, 'bar' );
		ractive.teardown().then( () => {
			t.equal( torndown, 1 );
		}).then( done, done );
	});


	test( 'Adaptor called on data provided in initial options when no template (#1285)', t => {
		function Wrapped () {}

		const obj = new Wrapped();

		const adaptor = {
			filter: obj => obj instanceof Wrapped,
			wrap: () => {
				return {
					get: () => obj,
					reset: () => false,
					set: (property, value) => obj.sekrit = value,
					teardown: () => true
				};
			}
		};

		const ractive = new Ractive({
			el: fixture,
			data: { wrapped: obj },
			adapt: [ adaptor ]
		});

		t.ok( !obj.sekrit );
		t.ok( !obj.enabled );
		ractive.set( 'wrapped.enabled', true );
		t.ok( obj.sekrit, 'adaptor set should have been used to set sekrit property' );
		t.ok( !obj.enabled, 'object property should not have been set, adaptor should have been used'	);
	});

	test( 'Components inherit modifyArrays option from environment (#1297)', t => {
		const Widget = Ractive.extend({
			template: '{{#each items}}{{this}}{{/each}}',
			isolated: false
		});

		// YOUR CODE GOES HERE
		const ractive = new Ractive({
			el: fixture,
			template: '<Widget/>',
			data: {
				items: [ 'a', 'b', 'c' ]
			},
			modifyArrays: false,
			components: { Widget }
		});

		ractive.findComponent( 'Widget' ).get( 'items' ).push( 'd' );
		t.htmlEqual( fixture.innerHTML, 'abc' );
	});

	test( 'Computed properties are adapted', t => {
		function Value ( value ) {
			this._ = value;
		}

		const adaptor = {
			filter: obj => obj instanceof Value,
			wrap: ( ractive, obj ) => ({
				get: () => obj._,
				set: () => null,
				reset: () => false,
				teardown: () => true
			})
		};

		const ractive = new Ractive({
			el: fixture,
			template: `{{foo}}`,
			data: { bar: 1 },
			adapt: [ adaptor ],
			computed: {
				foo () {
					return new Value( 2 * this.get( 'bar' ) );
				}
			}
		});

		t.htmlEqual( fixture.innerHTML, '2' );
		ractive.set( 'bar', 2 );
		t.htmlEqual( fixture.innerHTML, '4' );
	});

	test( 'display a collection from a model', t => {
		function extend ( parent, child ) {
			function Surrogate () {
				this.constructor = child;
			}
			Surrogate.prototype = parent.prototype;
			child.prototype = new Surrogate();
		}

		function Model ( attrs ) {
			this.attrs = attrs || {};
		}

		function Collection ( arr ) {
			this.arr = arr || [];
		}

		function Items ( arr ) {
			Collection.call(this, arr);
			return this;
		}

		extend( Collection, Items );

		function Store ( attrs ) {
			Model.call( this, attrs );
		}

		extend( Model, Store );

		Ractive.adaptors.ModelAdaptor = {
			filter: obj => obj instanceof Model,
			wrap: ( ractive, obj ) => {
				return {
					get: () => obj.attrs,
					set: ( prop, val ) => obj.attrs[ prop ] = val,
					reset: () => false,
					teardown: () => true
				};
			}
		};

		Ractive.adaptors.CollectionAdaptor = {
			filter: obj => obj instanceof Collection,
			wrap: ( ractive, obj ) => {
				return {
					get: () => obj.arr,
					reset: () => false,
					teardown: () => true
				};
			}
		};

		const store = new Store({
			items: new Items([
				{ name: 'duck' },
				{ name: 'chicken' }
			])
		});

		new Ractive({
			el: fixture,
			template: `{{#each store.items }}-{{ this.name }}{{/each}}`,
			data: { store },
			adapt: [ 'ModelAdaptor', 'CollectionAdaptor' ]
		});
		t.htmlEqual( fixture.innerHTML, '-duck-chicken' );
	});

	test( 'A component inherits adaptor config from its parent class', t => {
		function Wrapped () {}

		const adaptor = {
			filter: obj => obj instanceof Wrapped,
			wrap: () => {
				return {
					get: () => ({ foo: 'bar' }),
					teardown: () => null
				};
			}
		};

		const Sub = Ractive.extend({
			adapt: [ adaptor ]
		});

		const SubSub = Sub.extend({
			template: '{{wrapped.foo}}'
		});

		new SubSub({
			el: fixture,
			data: { wrapped: new Wrapped() }
		});

		t.htmlEqual( fixture.innerHTML, 'bar' );
	});

	test( 'Components inherit adaptors from their parent', t => {
		Ractive.adaptors.foo = fooAdaptor;

		Ractive.components.Widget = Ractive.extend({
			template: '<p>{{wrappedThing}}{{otherThing}}</p>',
			isolated: false
		});

		const r = new Ractive({
			el: fixture,
			template: '<Widget wrappedThing="{{thing}}"/>',
			adapt: [ 'foo' ],
			data: {
				thing: new Foo( 'whee!' )
			}
		});

		t.htmlEqual( fixture.innerHTML, '<p>whee!</p>' );

		r.findComponent( 'Widget' ).set( 'otherThing', new Foo( 'whoo!' ) );

		t.htmlEqual( fixture.innerHTML, '<p>whee!whoo!</p>' );

		delete Ractive.adaptors.foo;
	});

	test( 'isolated components do not inherit adaptors from their parents', t => {
		const adaptor = {
			filter ( value ) { return typeof value === 'string'; },
			wrap ( ractive, value ) {
				return {
					get () { return `${value}!`; },
					teardown () {}
				};
			}
		};

		const cmp = Ractive.extend({
			template: '{{foo}}',
			isolated: true
		});

		const r = new Ractive({
			el: fixture,
			template: '{{foo}}<cmp />',
			adapt: [ adaptor ],
			data: {
				foo: 'bar'
			},
			components: { cmp }
		});

		r.findComponent( 'cmp' ).set( 'foo', 'baz' );

		t.htmlEqual( fixture.innerHTML, 'bar!baz' );
	});

	test( 'adaptors should work with update (#2493)', t => {
		const thing = new Foo( 'one' );
		const r = new Ractive({
			adapt: [ 'foo' ],
			adaptors: { foo: fooAdaptor },
			el: fixture,
			template: '{{thing}}'
		});

		r.set( 'thing', thing );
		t.htmlEqual( fixture.innerHTML, 'one' );
		thing.content = 'two';
		r.update();
		t.htmlEqual( fixture.innerHTML, 'two' );
	});

	test( 'extra case for #2493', t => {
		const thing = { thing: 'one' };
		const adaptor = {
			filter ( child, parent, keypath ) {
				if ( !child || !child.thing ) return false;
				if ( parent && parent._wrapper && parent._wrapper[ keypath ] ) return false;
				return true;
			},

			wrap ( parent, child, keypath ) {
				if ( !parent._wrapper ) parent._wrapper = {};
				parent._wrapper[ keypath ] = child;

				return {
					get () { return child.thing; },
					teardown () { delete parent._wrapper[ keypath ]; }
				};
			}
		};

		const r = new Ractive({
			adapt: [ 'foo' ],
			adaptors: { foo: adaptor },
			el: fixture,
			template: '{{thing}}'
		});

		r.set( 'thing', thing );
		t.htmlEqual( fixture.innerHTML, 'one' );
		thing.thing = 'two';
		r.update();
		t.htmlEqual( fixture.innerHTML, 'two' );
	});

	test( 'adaptors with deeper keypaths should also work with update (#2500)', t => {
		const thing = { thing: { a: 1, b: 4 } };
		const adaptor = {
			filter ( child, keypath, parent ) {
				if ( !child || !child.thing ) return false;
				if ( parent && parent._wrapper && parent._wrapper[ keypath ] ) return false;
				return true;
			},

			wrap ( parent, child, keypath ) {
				if ( !parent._wrapper ) parent._wrapper = {};
				parent._wrapper[ keypath ] = child;

				return {
					get () {
						const res = {};
						for ( const k in child.thing ) res[k] = child.thing[k] + 1;
						return res;
					},
					teardown () { delete parent._wrapper[ keypath ]; }
				};
			}
		};

		const r = new Ractive({
			adapt: [ 'foo' ],
			adaptors: { foo: adaptor },
			el: fixture,
			template: '{{thing.a}} {{thing.b}}'
		});

		r.set( 'thing', thing );
		t.htmlEqual( fixture.innerHTML, '2 5' );

		thing.thing.a = 2;
		r.update( 'thing.a' );
		t.htmlEqual( fixture.innerHTML, '3 5' );

		thing.thing.b = 5;
		r.update( 'thing.b' );
		t.htmlEqual( fixture.innerHTML, '3 6' );

		thing.thing.a = 1;
		thing.thing.b = 2;
		r.update( 'thing' );
		t.htmlEqual( fixture.innerHTML, '2 3' );

		thing.thing.a = 5;
		thing.thing.b = 10;
		r.update();
		t.htmlEqual( fixture.innerHTML, '6 11' );

		thing.thing = { a: 2, b: 4 };
		r.update( 'thing' );
		t.htmlEqual( fixture.innerHTML, '3 5' );

		thing.thing = { a: 1, b: 4 };
		r.update();
		t.htmlEqual( fixture.innerHTML, '2 5' );
	});

	test( 'adaptors that adapt whilst marking should tear down old instances', t => {
		const obj = { foo: new Foo( 'one' ) };
		const r = new Ractive({
			adapt: [ 'foo' ],
			adaptors: { foo: fooAdaptor },
			el: fixture,
			template: '{{obj.foo}}',
			data: { obj }
		});

		const foo = obj.foo;
		t.ok( foo._wrapper );
		obj.foo = new Foo( 'two' );
		r.update( 'obj' );
		t.ok( !foo._wrapper );
	});

	test( 'Components made with Ractive.extend() can include adaptors', t => {
		Ractive.adaptors.foo = fooAdaptor;

		const Widget = Ractive.extend({
			adapt: [ 'foo' ],
			modifyArrays: false
		});

		const ractive = new Widget({
			el: fixture,
			template: '<p>{{thing}}</p>',
			data: {
				thing: new Foo( 'whee!' )
			}
		});

		t.deepEqual( ractive.viewmodel.adaptors, [ Ractive.adaptors.foo ] );
		t.htmlEqual( fixture.innerHTML, '<p>whee!</p>' );

		delete Ractive.adaptors.foo;
	});

	test( 'adapted values passed to expressions should be unwrapped (#2513)', t => {
		class Foo {
			constructor () {
				this.content = 'sup';
			}

			bar () { return 'hey'; }
		}

		const fooAdaptor = {
			filter ( object ) {
				return object instanceof Foo;
			},
			wrap ( ractive, foo ) {
				const wrapper = {
					get () {
						return foo.content;
					},
					teardown () {
						delete foo._wrapper;
					}
				};
				foo._wrapper = wrapper;
				return wrapper;
			}
		};

		new Ractive({
			el: fixture,
			template: '{{ foo }} {{ (foo).bar() }}',
			data: { foo: new Foo() },
			adapt: [ fooAdaptor ]
		});

		t.htmlEqual( fixture.innerHTML, 'sup hey' );
	});

	test( 'adapted values should be unwrapped by default with get, but wrapped when unwrap === false', t => {
		class Foo {
			constructor () {
				this.content = 'sup';
			}

			bar () { return 'hey'; }
		}

		const fooAdaptor = {
			filter ( object ) {
				return object instanceof Foo;
			},
			wrap ( ractive, foo ) {
				const wrapper = {
					get () {
						return foo.content;
					},
					teardown () {
						delete foo._wrapper;
					}
				};
				foo._wrapper = wrapper;
				return wrapper;
			}
		};

		const r = new Ractive({
			data: { foo: new Foo() },
			adapt: [ fooAdaptor ]
		});

		t.ok( r.get( 'foo' ) instanceof Foo );
		t.ok( r.get( 'foo', { unwrap: false } ) === 'sup' );
	});

	test( 'adaptors should not cause death during branching caused by two-way binding (#2467)', t => {
		const r = new Ractive({
			el: fixture,
			template: `<select value="{{foo.0.bar.0}}"><option>yep</option><option value="{{42}}">answer</option></select>`,
			modifyArrays: true
		});

		t.equal( r.get( 'foo.0.bar.0' ), 'yep' );

		r.set( 'foo', [] );
		t.equal( r.get( 'foo.0.bar.0' ), undefined );
	});

	test( 'adapted values that are mapped should be unwrapped on the mapped side (#2513 part 2)', t => {
		class Foo {
			constructor () {
				this.content = 'sup';
			}

			bar () { return 'hey'; }
		}

		const fooAdaptor = {
			filter ( object ) {
				return object instanceof Foo;
			},
			wrap ( ractive, foo ) {
				const wrapper = {
					get () {
						return foo.content;
					},
					teardown () {
						delete foo._wrapper;
					}
				};
				foo._wrapper = wrapper;
				return wrapper;
			}
		};

		const cmp = Ractive.extend({});
		const r = new Ractive({
			el: fixture,
			template: '<cmp it="{{foo}}" />',
			data: { foo: new Foo() },
			adapt: [ fooAdaptor ],
			components: { cmp }
		});

		const c = r.findComponent();
		t.ok( c.get( 'it' ) instanceof Foo, 'value is unwrapped' );
	});

	test( `updating the child of an adapted value only updates the child (#2693)`, t => {
		class Wrap {
			constructor (obj) {
				this.obj = obj;
			}
		}

		const wrapper = {
			filter ( obj ) {
				return obj instanceof Wrap;
			},
			wrap ( ractive, obj ) {
				const wrapper = {
					get () {
						return obj.obj;
					},
					teardown () {
						delete obj._wrapper;
					}
				};
				obj._wrapper = wrapper;
				return wrapper;
			}
		};

		const foo = new Wrap({ bar: 1, baz: 2 });
		const r = new Ractive({
			el: fixture,
			template: '{{foo.bar}} {{foo.baz}}',
			data: { foo },
			adapt: [ wrapper ]
		});

		let count1 = 0;
		let count2 = 0;
		r.observe( 'foo.bar', () => count1++, { init: false } );
		r.observe( 'foo.baz', () => count2++, { init: false } );

		t.htmlEqual( fixture.innerHTML, '1 2' );

		foo.obj.bar = 42;
		r.update( 'foo.bar' );

		t.htmlEqual( fixture.innerHTML, '42 2' );
		t.equal( count1, 1 );
		t.equal( count2, 0 );
	});

	test('Reset should preserve wrapped value if not tearing down', t => {
		function Box(width, height){
			let _width = width;
			let _height = height;

			this.getWidth = function(){ return _width; };
			this.setWidth = function(width){ _width = width; };
			this.getHeight = function(){ return _height; };
			this.setHeight = function(height){ _height = height; };
		}

		// The Box adaptor in the docs
		const BoxAdaptor = {
			filter ( object ) {
				return object instanceof Box;
			},
			wrap ( ractive, box, keypath, prefixer ) {
				const setWidth = box.setWidth;
				const setHeight = box.setHeight;

				box.setWidth = function(width){
					ractive.set(prefixer({ width }));
				};

				box.setHeight = function(height){
					ractive.set(prefixer({ height }));
				};

				return {
					get(){
						return {
							width: box.getWidth(),
							height: box.getHeight()
						};
					},
					set(property, value){
						if(property === 'width') setWidth.call(box, value);
						if(property === 'height') setHeight.call(box, value);
					},
					reset(data){
						if(typeof data !== 'object' || data instanceof Box) return false;
						if(data.width !== undefined) setWidth.call(box, data.width);
						if(data.height !== undefined) setHeight.call(box, data.height);
					},
					// Delete the monkey-patched methods.
					teardown(){
						delete box.setWidth;
						delete box.setHeight;
					}
				};
			}
		};

		const model = new Box(1,2);
		const instance = Ractive({ adapt: [ BoxAdaptor ], data: { model } });

		t.strictEqual(instance.get('model'), model, 'Instance should return model');
		t.deepEqual(instance.get('model', { unwrap: false }), { width: 1, height: 2 }, 'Instance should return wrapped model');
		t.strictEqual(instance.get('model.width'), 1, 'Instance has box width of 1');
		t.strictEqual(instance.get('model.height'), 2, 'Instance has box height of 2');
		t.strictEqual(model.getWidth(), 1, 'Model has box width of 1');
		t.strictEqual(model.getHeight(), 2, 'Model has box height of 2');

		instance.set('model', { width: 3, height: 4 });

		t.strictEqual(instance.get('model'), model, 'Instance should still return model');
		t.deepEqual(instance.get('model', { unwrap: false }), { width: 3, height: 4 }, 'Instance should return wrapped model');
		t.strictEqual(instance.get('model.width'), 3, 'Instance has box width of 3');
		t.strictEqual(instance.get('model.height'), 4, 'Instance has box height of 4');
		t.strictEqual(model.getWidth(), 3, 'Model has box width of 3');
		t.strictEqual(model.getHeight(), 4, 'Model has box height of 4');

	});

	test('Teardown to a non-adapted value', t => {
		const Adaptor = {
			filter ( object ) {
				return object && typeof object.then === 'function';
			},
			wrap () {
				const get = () => null;
				const set = () => {};
				const reset = () => false;
				const teardown = () => {};
				return { get, set, reset, teardown };
			}
		};

		const model = Promise.resolve();
		const instance = Ractive({
			adapt: [Adaptor],
			data: { model },
			el: fixture,
			template: '<p>{{ model }}</p>'
		});

		t.strictEqual(instance.get('model'), model);
		t.strictEqual(instance.get('model', { unwrap: false }), null);
		t.strictEqual(instance.find('p').innerHTML, '');

		instance.set('model', 1);

		t.strictEqual(instance.get('model'), 1);
		t.strictEqual(instance.get('model', { unwrap: false }), 1);
		t.strictEqual(instance.find('p').innerHTML, '1');
	});

	test('Teardown to a non-adapted value asynchronously', t => {
		const done = t.async();

		// ractive-adaptor-promise
		const Adaptor = {
			filter (object) {
				return object != null && typeof object.then === 'function';
			},
			wrap (ractive, object, keypath) {
				let removed = false;
				const get = () => null;
				const set = () => {};
				const reset = () => false;
				const teardown = () => { removed = true; };
				const setter = result => { removed ? void 0 : ractive.set(keypath, result); };

				object.then(setter, setter);

				return { get, set, reset, teardown };
			}
		};

		const value = new Promise(resolve => {
			setTimeout(() => { resolve(1); }, 2000);
		});

		const instance = Ractive({
			adapt: [Adaptor],
			data: { value },
			el: fixture,
			template: '<p>{{ value }}</p>'
		});

		t.strictEqual(instance.get('value'), value);
		t.strictEqual(instance.get('value', { unwrap: false }), null);
		t.strictEqual(instance.find('p').innerHTML, '');

		value.then(() => {
			t.strictEqual(instance.get('value'), 1);
			t.strictEqual(instance.get('value', { unwrap: false }), 1);
			t.strictEqual(instance.find('p').innerHTML, '1');
			done();
		});

	});

	test( `children of computations are also adapted (#3130)`, t => {
		const arr = [ 'hello' ];
		let count = 0;

		const Adaptor = {
			filter ( v ) { return typeof v === 'string'; },
			wrap ( ractive, v ) {
				return {
					get () { return v + ' adapted'; },
					teardown () { count++; }
				};
			}
		};

		const r = new Ractive({
			target: fixture,
			template: '{{#each list}}{{.}}{{/each}}',
			adapt: [ Adaptor ],
			computed: {
				list: {
					get () { return arr; },
				}
			}
		});

		t.htmlEqual( fixture.innerHTML, 'hello adapted' );

		arr[0] = 'still';
		r.update( 'list' );

		t.htmlEqual( fixture.innerHTML, 'still adapted' );
		t.equal( count, 1 );
	});

	test( `Children of computed properties should be unwrapped by ractive.get() (#3137)`, (t) => {
		const value = 'hello';

		const Adaptor = {
			filter ( v ) { return v === value; },
			wrap ( ractive, v ) {
				return {
					get () { return v + ' adapted'; },
					teardown () { }
				};
			}
		};

		const r = new Ractive({
			adapt: [ Adaptor ],
			target: fixture,
			components: {
				c: Ractive.extend({
					template: '{{data}}',
				}),
			},
			template: '{{scalar}}, {{#each list}}{{.}}{{/each}}, <c data={{scalar}} />, <c data={{list.0}} />',
			computed: {
				scalar() { return value; },
				list() { return [value]; },
			}
		});

		const children = r.findAllComponents('c');

		t.strictEqual(r.get('scalar'), value, 'the computation should be unwrapped by default');
		t.strictEqual(r.get('list.0'), value, 'the computation children should be unwrapped by default');
		t.strictEqual(children[0].get('data'), value, 'the linked computation should be unwrapped by default');
		t.strictEqual(children[1].get('data'), value, 'the linked computation children should be unwrapped by default');

		t.strictEqual(r.get('scalar', {unwrap: false}), 'hello adapted', 'the computation should be wrapped');
		t.strictEqual(r.get('list.0', {unwrap: false}), 'hello adapted', 'the computation children should be wrapped');
		t.strictEqual(children[0].get('data', {unwrap: false}), 'hello adapted', 'the linked computation should be wrapped');
		t.strictEqual(children[1].get('data', {unwrap: false}), 'hello adapted', 'the linked computation children should be wrapped');

		t.strictEqual(r.get('scalar', {unwrap: true}), 'hello', 'the computation should be unwrapped');
		t.strictEqual(r.get('list.0', {unwrap: true}), 'hello', 'the computation children should be unwrapped');
		t.strictEqual(children[0].get('data', {unwrap: true}), 'hello', 'the linked computation should be unwrapped');
		t.strictEqual(children[1].get('data', {unwrap: true}), 'hello', 'the linked computation children should be unwrapped');

		t.htmlEqual( fixture.innerHTML, 'hello adapted, hello adapted, hello adapted, hello adapted', 'the output should use the wrapped value');
	});

	test(`Calling "ractive.get()" on an attribute set to an expression should unwrap the value (#3143)`, t => {
		const value = 'hello';

		const Adaptor = {
			filter(v) {
				return v === value;
			},
			wrap(ractive, v) {
				return {
					get() {
						return v + ' adapted';
					},
					teardown() {},
				};
			},
		};

		const r = new Ractive({
			adapt: [Adaptor],
			el: fixture,
			data: {
				index: 0,
				list: [value],
			},
			components: {
				child: Ractive.extend({
					template: '{{data}}',
				}),
			},
			template: '<child data={{list[index]}} />',
		});
		const child = r.findComponent('child');

		t.strictEqual(child.get('data'), value, 'the value should be unwrapped by default');
		t.strictEqual(child.get('data', { unwrap: true }), value, 'the value should be unwrapped');
		t.strictEqual(child.get('data', { unwrap: false }), value + ' adapted', 'the value should be wrapped');

		t.htmlEqual(fixture.innerHTML, 'hello adapted', 'the output should use the wrapped value');
	});

	test( `let resolved adaptors be added to an instance after init via pushing to adapt (#3147)`, t => {
		const r = new Ractive({
			target: fixture,
			template: '{{foo.bar}}',
			data: { foo: {} }
		});

		t.htmlEqual( fixture.innerHTML, '' );

		r.adapt.push({
			filter ( v, k ) { return k === 'foo'; },
			wrap () {
				return {
					get () { return { bar: 'bar' }; },
					teardown () {}
				};
			}
		});

		r.set( 'foo', {} );

		t.htmlEqual( fixture.innerHTML, 'bar' );
	});
}
