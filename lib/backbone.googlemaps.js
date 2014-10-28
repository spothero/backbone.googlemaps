/**
 *
 * Modified for SpotHero
 *
 */
/*!
 * Backbone.GoogleMaps
 * A Backbone JS layer for the GoogleMaps API
 * Copyright (c)2012 Edan Schwartz
 * Distributed under MIT license
 * https://github.com/eschwartz/backbone.googlemaps
 */
'use strict';

// require jquery and attach to window
window.$ = require('jquery');

// require additional global libs
var _ = require('underscore'),
    Backbone = require('backbone');

// tell backbone where to find jQuery
Backbone.$ = window.$;

// require plugins
require('jquery.scrollto');

// require modules
var gmaps = require('google').maps,
    richmarker = require('richmarker'),
    SpotDetailModalView = require('../views/search/filters');


// module export
module.exports = function() {

    var GoogleMaps = {};

    /**
     * GoogleMaps.Location
     * --------------------
     * Representing a lat/lng location on a map
     */
    GoogleMaps.Location = Backbone.Model.extend({
        constructor: function() {
            _.bindAll(this, 'select', 'deselect', 'toggleSelect', 'getLatLng', 'getLatlng');

            this.defaults = _.extend({}, {
                lat: 0,
                lng: 0,
                selected: false,
                title: ""
            }, this.defaults);

            Backbone.Model.prototype.constructor.apply(this, arguments);

            // Trigger 'selected' and 'deselected' events
            this.listenTo(this, "change:selected", function(model, isSelected) {
                var topic = isSelected ? "selected" : "deselected";
                this.trigger(topic, this);
            });
        },

        select: function() {
            this.set("selected", true);
        },

        deselect: function() {
            this.set("selected", false);
        },

        toggleSelect: function() {
            this.set("selected", !this.get("selected"));
        },

        getLatlng: function() {
            return this.getLatLng();
        },

        getLatLng: function() {
            return new gmaps.LatLng(this.get("lat"), this.get("lng"));
        }
    });

    /**
     * GoogleMaps.LocationCollection
     * ------------------------------
     * A collection of map locations
     */
    GoogleMaps.LocationCollection = Backbone.Collection.extend({
        model: GoogleMaps.Location,

        constructor: function() {
            Backbone.Collection.prototype.constructor.apply(this, arguments);

            // Deselect other models on model select
            // ie. Only a single model can be selected in a collection
            this.listenTo(this, "change:selected", function(selectedModel, isSelected) {
                if (isSelected) {
                    this.each(function(model) {
                        if (selectedModel.cid !== model.cid) {
                            model.deselect();
                        }
                    });
                }
            });
        }
    });

    /**
     * GoogleMaps.MapView
     * ------------------
     * Base maps overlay view from which all other overlay views extend
     */
    GoogleMaps.MapView = Backbone.View.extend({
        // Hash of Google Map events
        // Events will be attached to this.gOverlay (google map or overlay)
        // eg `zoom_changed': 'handleZoomChange'
        mapEvents: {},

        overlayOptions: {},

        constructor: function(options) {
            _.bindAll(this, 'render', 'close');

            Backbone.View.prototype.constructor.apply(this, arguments);

            this.options = options;

            // Ensure map and API loaded
            if (!google || !gmaps) {
                throw new Error("Google maps API is not loaded.");
            }
            if (!this.options.map && !this.map) {
                throw new Error("A map must be specified.");
            }
            this.gOverlay = this.map = this.options.map || this.map;

            // Add overlayOptions from ctor options
            // to this.overlayOptions
            _.extend(this.overlayOptions, this.options.overlayOptions);
        },

        // Attach listeners to the this.gOverlay
        // From the `mapEvents` hash
        bindMapEvents: function(mapEvents, opt_context) {
            var context = opt_context || this;

            mapEvents || (mapEvents = this.mapEvents);

            _.each(mapEvents, function(handlerRef, topic) {
                var handler = this._getHandlerFromReference(handlerRef);
                this._addGoogleMapsListener(topic, handler, context);
                this._addGoogleMapsListener(topic, handler, context);
            }, this);
        },

        // handlerRef can be a named method of the view (string)
        // or a refernce to any function.
        _getHandlerFromReference: function(handlerRef) {
            var handler = _.isString(handlerRef) ? this[handlerRef] : handlerRef;

            if (!_.isFunction(handler)) {
                throw new Error("Unable to bind map event. " + handlerRef +
                    " is not a valid event handler method");
            }

            return handler;
        },

        _addGoogleMapsListener: function(topic, handler, opt_context) {
            if (opt_context) {
                handler = _.bind(handler, opt_context);
            }
            // due to addition of marker update on model change let's make sure we don't apply duplicate listeners
            if (typeof this.listeners !== 'undefined' && typeof this.listeners[topic] !== 'undefined') {
                gmaps.event.removeListener(this.listeners[topic]);
            }
            if (typeof this.listeners === 'undefined') {
                this.listeners = [];
            }
            this.listeners[topic] = gmaps.event.addListener(this.gOverlay, topic, handler);
        },

        render: function() {
            this.trigger('before:render');
            if (this.beforeRender) {
                this.beforeRender();
            }
            this.bindMapEvents();

            this.trigger('render');
            if (this.onRender) {
                this.onRender();
            }

            return this;
        },

        // Clean up view
        // Remove overlay from map and remove event listeners
        close: function() {
            this.trigger('before:close');
            if (this.beforeClose) {
                this.beforeClose();
            }

            gmaps.event.clearInstanceListeners(this.gOverlay);
            if (this.gOverlay.setMap) {
                this.gOverlay.setMap(null);
            }
            this.gOverlay = null;

            this.trigger('close');
            if (this.onClose) {
                this.onClose();
            }
        }
    });

    /**
     * GoogleMaps.InfoWindow
     * ---------------------
     * View controller for a gmaps.InfoWindow overlay instance
     */
    GoogleMaps.InfoWindow = GoogleMaps.MapView.extend({
        constructor: function() {
            GoogleMaps.MapView.prototype.constructor.apply(this, arguments);

            _.bindAll(this, 'render', 'close');

            // Require a related marker instance
            if (!this.options.marker && !this.marker) {
                throw new Error("A marker must be specified for InfoWindow view.");
            }
            this.marker = this.options.marker || this.marker;

            // Set InfoWindow template
            this.template = this.template || this.options.template;

        },

        // Render
        render: function() {
            this.trigger('before:render');
            if (this.beforeRender) {
                this.beforeRender();
            }

            GoogleMaps.MapView.prototype.render.apply(this, arguments);

            // Render element
            var tmpl = (this.template) ? this.template : '<h2><%=title %></h2>';

            this.$el.html(_.template(tmpl, this.model.toJSON()));

            return this;
        },

        // Close and delete window, and clean up view
        close: function() {
            this.trigger('before:close');
            if (this.beforeClose) {
                this.beforeClose();
            }

            GoogleMaps.MapView.prototype.close.apply(this, arguments);

            this.trigger('close');
            if (this.onClose) {
                this.onClose();
            }

            return this;
        }
    });


    /**
     * GoogleMaps.MarkerView
     * ---------------------
     * View controller for a marker overlay
     */
    GoogleMaps.MarkerView = GoogleMaps.MapView.extend({
        // Set associated InfoWindow view
        infoWindow: GoogleMaps.InfoWindow,

        constructor: function() {
            GoogleMaps.MapView.prototype.constructor.apply(this, arguments);

            _.bindAll(this, 'render', 'close', 'openDetail', 'closeDetail', 'clickMarker');

            // Ensure model
            if (!this.model) {
                throw new Error("A model must be specified for a MarkerView");
            }

            // Instantiate marker, with user defined properties
            this.gOverlay = new RichMarker(_.extend({
                position: this.model.getLatLng(),
                map: this.map,
                title: this.model.title,
                animation: gmaps.Animation.DROP
            }, this.overlayOptions));

            // Add default mapEvents
            _.extend(this.mapEvents, {
                'click': 'clickMarker' // Select model on marker click
            });
            // HACK ie8 hack, we need to manage this flag
            // because ie8 fires multiple click events on marker click
            // within MarkerView, updated in clickMarker and close
            window.markerClickable = true;
        },

        clickMarker: function() {
            if (!FindParking.map_dragging && window.markerClickable) {
                this.openDetail();
                window.markerClickable = false;
            }
        },

        // Show the google maps marker overlay
        render: function() {
            var id = this.model.id,
                content;

            this.trigger('before:render');
            if (this.beforeRender) {
                this.beforeRender();
            }
            FindParking.markers[id] = this.gOverlay;
            content = FindParking.markers[id].getContent();

            // since we are only doing one top result for now activeMarker adds large pin
            if (this.model.get('activeMarker')) {
                if (content.indexOf('label-lg') < 0) {
                    // ie8 requires a setTimeout to ensure prevoius setContent calls are complete
                    setTimeout(function() {
                        FindParking.markers[id].setContent(content.replace(/glabel/g, 'glabel label-lg'));
                    }, 0);
                }
            } else {
                FindParking.markers[id].setContent(content.replace(/label-lg/g, ''));
            }

            if (typeof this.model.get('hourly_rates')[0] !== 'undefined' && this.model.get('hourly_rates')[0].unavailable) {
                if (content.indexOf('label-disabled') < 0) {
                    FindParking.markers[id].setContent(content.replace('glabel', 'glabel label-disabled'));
                }
            }

            GoogleMaps.MapView.prototype.render.apply(this, arguments);


            if (this.model.get('hidden')) {
                FindParking.markers[id].setVisible(false);
            } else {
                FindParking.markers[id].setVisible(true);
            }

            this.trigger('render');
            if (this.onRender) {
                this.onRender();
            }

            return this;
        },

        close: function() {

            window.markerClickable = true;

            this.trigger('before:close');
            if (this.beforeClose) {
                this.beforeClose();
            }

            this.closeDetail();
            GoogleMaps.MapView.prototype.close.apply(this, arguments);
            //this.model.off();
            this.stopListening();
            this.trigger('close');
            if (this.onClose) {
                this.onClose();
            }

            return this;
        },

        openDetail: function() {

            FindParking.spotDetailModalView = new SpotDetailModalView({
                model: this.model
            });
            var $map = $('#map').parent(),
                $openModal = $('.sh-modal-open:first', $map),
                $modalHTML = FindParking.spotDetailModalView.render().$el;
            if ($openModal.length) {
                $openModal.replaceWith($modalHTML.addClass('sh-modal-open'));
                FindParking.spotDetailModalView.trigger('rerendered');
            } else {
                $map.append($modalHTML);
                FindParking.spotDetailModalView.trigger('rendered');
            }

            var $results = $('#results'),
                $feature = $results.prev(),
                $detail = $('.detail', $feature),
                $listScroll = $results.closest('.list-scroll'),
                $spotResultItem = $('#spot_' + this.model.id, $results);

            // scrollTo active list item if not already in view
            // make sure sticky class is applied first so offset is consistent
            $feature.addClass('sticky');
            _.delay(function() {
                $listScroll.scrollTo($spotResultItem, {
                    duration: 250,
                    offset: -$detail[0].clientHeight
                });
            });

            $spotResultItem
                .removeClass('highlight')
                .addClass('highlight');
        },

        closeDetail: function() {
            if (typeof FindParking.spotDetailModalView !== 'undefined') {
                FindParking.spotDetailModalView.trigger('close');
            }
        }
    });

    /**
     * GoogleMaps.MarkerCollectionView
     * -------------------------------
     * Collection of MarkerViews
     */
    GoogleMaps.MarkerCollectionView = Backbone.View.extend({

        markerView: GoogleMaps.MarkerView,

        markerViewChildren: {},

        constructor: function(options) {
            Backbone.View.prototype.constructor.apply(this, arguments);

            this.options = options;

            _.bindAll(this, 'render', 'closeChildren', 'closeChild', 'addChild', 'refresh', 'close');

            // Ensure map property
            if (!this.options.map && !this.map) {
                throw new Error("A map must be specified on MarkerCollectionView instantiation");
            }
            this.map || (this.map = this.options.map);

            // Bind to collection
            this.listenTo(this.collection, "reset", this.refresh);
            this.listenTo(this.collection, "add", this.addChild);
            this.listenTo(this.collection, "remove", this.closeChild);
        },

        // Render MarkerViews for all models in collection
        render: function(collection) {
            collection = collection || this.collection;

            this.trigger('before:render');
            if (this.beforeRender) {
                this.beforeRender();
            }

            // Create marker views for each model
            collection.each(this.addChild);

            this.trigger('render');
            if (this.onRender) {
                this.onRender();
            }

            return this;
        },

        // Close all child MarkerViews
        closeChildren: function() {
            for (var cid in this.markerViewChildren) {
                if (typeof cid !== 'undefined') {
                    this.closeChild(this.markerViewChildren[cid]);
                }
            }
        },

        closeChild: function(child) {
            // Param can be child's model, or child view itself
            var childView = (child instanceof Backbone.Model) ? this.markerViewChildren[child.cid] : child;

            childView.close();
            delete this.markerViewChildren[childView.model.cid];
        },

        // Add a MarkerView and render
        addChild: function(childModel) {
            var markerView = new this.markerView({
                model: childModel,
                map: this.map
            });

            this.markerViewChildren[childModel.cid] = markerView;

            markerView.render();
        },

        refresh: function() {
            this.closeChildren();
            this.render();
        },

        // Close all child MarkerViews
        close: function() {
            this.closeChildren();
            //this.collection.off();
            this.stopListening();
        }
    });

    Backbone.GoogleMaps = GoogleMaps;
    return GoogleMaps;
};
