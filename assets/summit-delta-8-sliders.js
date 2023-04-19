(function (module, exports, __webpack_require__) {

  "use strict";
  // @wf-will-never-add-flow-to-this-file

  /* globals window, document */

  /* eslint-disable no-var */

  /**
   * Webflow: Dropdown component
   */

  var Webflow = __webpack_require__(3);

  var IXEvents = __webpack_require__(18);

  var KEY_CODES = {
    ARROW_LEFT: 37,
    ARROW_UP: 38,
    ARROW_RIGHT: 39,
    ARROW_DOWN: 40,
    ESCAPE: 27,
    SPACE: 32,
    ENTER: 13,
    HOME: 36,
    END: 35
  };
  var FORCE_CLOSE = true;
  /**
   * This pattern matches links that begin with a `#` AND have some alphanumeric
   * characters after it, including also hyphens and underscores
   *
   * Matches:
   * #foo
   * #999
   * #foo-bar_baz
   *
   * Does not match:
   * #
   */

  var INTERNAL_PAGE_LINK_HASHES_PATTERN = /^#[a-zA-Z0-9\-_]+$/;
  Webflow.define('dropdown', module.exports = function ($, _) {
    var debounce = _.debounce;
    var api = {};
    var inApp = Webflow.env();
    var inPreview = false;
    var inDesigner;
    var touch = Webflow.env.touch;
    var namespace = '.w-dropdown';
    var openStateClassName = 'w--open';
    var ix = IXEvents.triggers;
    var defaultZIndex = 900; // @dropdown-depth

    var focusOutEvent = 'focusout' + namespace;
    var keydownEvent = 'keydown' + namespace;
    var mouseEnterEvent = 'mouseenter' + namespace;
    var mouseMoveEvent = 'mousemove' + namespace;
    var mouseLeaveEvent = 'mouseleave' + namespace;
    var mouseUpEvent = (touch ? 'click' : 'mouseup') + namespace;
    var closeEvent = 'w-close' + namespace;
    var settingEvent = 'setting' + namespace;
    var $doc = $(document);
    var $dropdowns; // -----------------------------------
    // Module methods

    api.ready = init;

    api.design = function () {
      // Close all when returning from preview
      if (inPreview) {
        closeAll();
      }

      inPreview = false;
      init();
    };

    api.preview = function () {
      inPreview = true;
      init();
    }; // -----------------------------------
    // Private methods


    function init() {
      inDesigner = inApp && Webflow.env('design'); // Find all instances on the page

      $dropdowns = $doc.find(namespace);
      $dropdowns.each(build);
    }

    function build(i, el) {
      var $el = $(el); // Store state in data

      var data = $.data(el, namespace);

      if (!data) {
        data = $.data(el, namespace, {
          open: false,
          el: $el,
          config: {},
          selectedIdx: -1
        });
      }

      data.toggle = data.el.children('.w-dropdown-toggle');
      data.list = data.el.children('.w-dropdown-list');
      data.links = data.list.find('a:not(.w-dropdown .w-dropdown a)');
      data.complete = complete(data);
      data.mouseLeave = makeMouseLeaveHandler(data);
      data.mouseUpOutside = outside(data);
      data.mouseMoveOutside = moveOutside(data); // Set config from data attributes

      configure(data); // Store the IDs of the toggle button & list

      var toggleId = data.toggle.attr('id');
      var listId = data.list.attr('id'); // If user did not provide toggle ID, set it

      if (!toggleId) {
        toggleId = 'w-dropdown-toggle-' + i;
      } // If user did not provide list ID, set it


      if (!listId) {
        listId = 'w-dropdown-list-' + i;
      } // Add attributes to toggle element


      data.toggle.attr('id', toggleId);
      data.toggle.attr('aria-controls', listId);
      data.toggle.attr('aria-haspopup', 'menu');
      data.toggle.attr('aria-expanded', 'false'); // Hide toggle icon from ATs

      data.toggle.find('.w-icon-dropdown-toggle').attr('aria-hidden', 'true'); // If toggle element is not a button

      if (data.toggle.prop('tagName') !== 'BUTTON') {
        // Give it an appropriate role
        data.toggle.attr('role', 'button'); // And give it a tabindex if user has not provided one

        if (!data.toggle.attr('tabindex')) {
          data.toggle.attr('tabindex', '0');
        }
      } // Add attributes to list element


      data.list.attr('id', listId);
      data.list.attr('aria-labelledby', toggleId);
      data.links.each(function (idx, link) {
        /**
         * In macOS Safari, links don't take focus on click unless they have
         * a tabindex. Without this, the dropdown will break.
         * @see https://gist.github.com/cvrebert/68659d0333a578d75372
         */
        if (!link.hasAttribute('tabindex')) link.setAttribute('tabindex', '0'); // We want to close the drop down if the href links somewhere internally
        // to the page

        if (INTERNAL_PAGE_LINK_HASHES_PATTERN.test(link.hash)) {
          link.addEventListener('click', close.bind(null, data));
        }
      }); // Remove old events

      data.el.off(namespace);
      data.toggle.off(namespace);

      if (data.nav) {
        data.nav.off(namespace);
      }

      var initialToggler = makeToggler(data, FORCE_CLOSE);

      if (inDesigner) {
        data.el.on(settingEvent, makeSettingEventHandler(data));
      }

      if (!inDesigner) {
        // Close in preview mode and clean the data.hovering state
        if (inApp) {
          data.hovering = false;
          close(data);
        }

        if (data.config.hover) {
          data.toggle.on(mouseEnterEvent, makeMouseEnterHandler(data));
        }

        data.el.on(closeEvent, initialToggler);
        data.el.on(keydownEvent, makeDropdownKeydownHandler(data));
        data.el.on(focusOutEvent, makeDropdownFocusOutHandler(data));
        data.toggle.on(mouseUpEvent, initialToggler);
        data.toggle.on(keydownEvent, makeToggleKeydownHandler(data));
        data.nav = data.el.closest('.w-nav');
        data.nav.on(closeEvent, initialToggler);
      }
    }
    /**
     * Mutate the data object with a new config property
     */


    function configure(data) {
      // Determine if z-index should be managed
      var zIndex = Number(data.el.css('z-index'));
      data.manageZ = zIndex === defaultZIndex || zIndex === defaultZIndex + 1;
      data.config = {
        hover: data.el.attr('data-hover') === 'true' && !touch,
        delay: data.el.attr('data-delay')
      };
    }

    function makeSettingEventHandler(data) {
      return function (evt, options) {
        options = options || {};
        configure(data);
        options.open === true && open(data, true);
        options.open === false && close(data, {
          immediate: true
        });
      };
    }

    function makeToggler(data, forceClose) {
      return debounce(function (evt) {
        if (data.open || evt && evt.type === 'w-close') {
          return close(data, {
            forceClose: forceClose
          });
        }

        open(data);
      });
    }

    function open(data) {
      if (data.open) {
        return;
      }

      closeOthers(data);
      data.open = true;
      data.list.addClass(openStateClassName);
      data.toggle.addClass(openStateClassName);
      data.toggle.attr('aria-expanded', 'true'); // ARIA

      ix.intro(0, data.el[0]);
      Webflow.redraw.up(); // Increase z-index to keep above other managed dropdowns

      data.manageZ && data.el.css('z-index', defaultZIndex + 1); // Listen for click outside events

      var isEditor = Webflow.env('editor');

      if (!inDesigner) {
        $doc.on(mouseUpEvent, data.mouseUpOutside);
      }

      if (data.hovering && !isEditor) {
        data.el.on(mouseLeaveEvent, data.mouseLeave);
      }

      if (data.hovering && isEditor) {
        $doc.on(mouseMoveEvent, data.mouseMoveOutside);
      } // Clear previous delay


      window.clearTimeout(data.delayId);
    }

    function close(data) {
      var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
        immediate = _ref.immediate,
        forceClose = _ref.forceClose;

      if (!data.open) {
        return;
      } // Do not close hover-based menus if currently hovering


      if (data.config.hover && data.hovering && !forceClose) {
        return;
      }

      data.toggle.attr('aria-expanded', 'false');
      data.open = false;
      var config = data.config;
      ix.outro(0, data.el[0]); // Stop listening for click outside events

      $doc.off(mouseUpEvent, data.mouseUpOutside);
      $doc.off(mouseMoveEvent, data.mouseMoveOutside);
      data.el.off(mouseLeaveEvent, data.mouseLeave); // Clear previous delay

      window.clearTimeout(data.delayId); // Skip delay during immediate

      if (!config.delay || immediate) {
        return data.complete();
      } // Optionally wait for delay before close


      data.delayId = window.setTimeout(data.complete, config.delay);
    }

    function closeAll() {
      $doc.find(namespace).each(function (i, el) {
        $(el).triggerHandler(closeEvent);
      });
    }

    function closeOthers(data) {
      var self = data.el[0];
      $dropdowns.each(function (i, other) {
        var $other = $(other);

        if ($other.is(self) || $other.has(self).length) {
          return;
        }

        $other.triggerHandler(closeEvent);
      });
    }

    function outside(data) {
      // Unbind previous click handler if it exists
      if (data.mouseUpOutside) {
        $doc.off(mouseUpEvent, data.mouseUpOutside);
      } // Close menu when clicked outside


      return debounce(function (evt) {
        if (!data.open) {
          return;
        }

        var $target = $(evt.target);

        if ($target.closest('.w-dropdown-toggle').length) {
          return;
        }

        var isEventOutsideDropdowns = $.inArray(data.el[0], $target.parents(namespace)) === -1;
        var isEditor = Webflow.env('editor');

        if (isEventOutsideDropdowns) {
          if (isEditor) {
            var isEventOnDetachedSvg = $target.parents().length === 1 && $target.parents('svg').length === 1;
            var isEventOnHoverControls = $target.parents('.w-editor-bem-EditorHoverControls').length;

            if (isEventOnDetachedSvg || isEventOnHoverControls) {
              return;
            }
          }

          close(data);
        }
      });
    }

    function complete(data) {
      return function () {
        data.list.removeClass(openStateClassName);
        data.toggle.removeClass(openStateClassName); // Reset z-index for managed dropdowns

        data.manageZ && data.el.css('z-index', '');
      };
    }

    function makeMouseEnterHandler(data) {
      return function () {
        data.hovering = true;
        open(data);
      };
    }

    function makeMouseLeaveHandler(data) {
      return function () {
        data.hovering = false; // We do not want the list to close upon mouseleave
        // if one of the links has focus

        if (!data.links.is(':focus')) {
          close(data);
        }
      };
    }

    function moveOutside(data) {
      return debounce(function (evt) {
        if (!data.open) {
          return;
        }

        var $target = $(evt.target);
        var isEventOutsideDropdowns = $.inArray(data.el[0], $target.parents(namespace)) === -1;

        if (isEventOutsideDropdowns) {
          var isEventOnHoverControls = $target.parents('.w-editor-bem-EditorHoverControls').length;
          var isEventOnHoverToolbar = $target.parents('.w-editor-bem-RTToolbar').length;
          var $editorOverlay = $('.w-editor-bem-EditorOverlay');
          var isDropdownInEdition = $editorOverlay.find('.w-editor-edit-outline').length || $editorOverlay.find('.w-editor-bem-RTToolbar').length;

          if (isEventOnHoverControls || isEventOnHoverToolbar || isDropdownInEdition) {
            return;
          }

          data.hovering = false;
          close(data);
        }
      });
    }

    function makeDropdownKeydownHandler(data) {
      return function (evt) {
        // Don't respond to keyboard in designer or if the list is not open
        if (inDesigner || !data.open) {
          return;
        } // Realign selectedIdx with the menu item that is currently in focus.
        // We need this because we do not track the `Tab` key activity!


        data.selectedIdx = data.links.index(document.activeElement); // Evaluate item-selection logic

        switch (evt.keyCode) {
          case KEY_CODES.HOME:
            {
              if (!data.open) return;
              data.selectedIdx = 0;
              focusSelectedLink(data);
              return evt.preventDefault();
            }

          case KEY_CODES.END:
            {
              if (!data.open) return;
              data.selectedIdx = data.links.length - 1;
              focusSelectedLink(data);
              return evt.preventDefault();
            }

          case KEY_CODES.ESCAPE:
            {
              close(data);
              data.toggle.focus();
              return evt.stopPropagation();
            }

          case KEY_CODES.ARROW_RIGHT:
          case KEY_CODES.ARROW_DOWN:
            {
              data.selectedIdx = Math.min(data.links.length - 1, data.selectedIdx + 1);
              focusSelectedLink(data);
              return evt.preventDefault();
            }

          case KEY_CODES.ARROW_LEFT:
          case KEY_CODES.ARROW_UP:
            {
              data.selectedIdx = Math.max(-1, data.selectedIdx - 1);
              focusSelectedLink(data);
              return evt.preventDefault();
            }
        }
      };
    }

    function focusSelectedLink(data) {
      if (data.links[data.selectedIdx]) {
        data.links[data.selectedIdx].focus();
      }
    }

    function makeToggleKeydownHandler(data) {
      // We want to close immediately
      // if interacting via keyboard
      var toggler = makeToggler(data, FORCE_CLOSE);
      return function (evt) {
        if (inDesigner) return; // If the menu is not open, we don't want
        // the up or Down arrows to do anything

        if (!data.open) {
          switch (evt.keyCode) {
            case KEY_CODES.ARROW_UP:
            case KEY_CODES.ARROW_DOWN:
              {
                return evt.stopPropagation();
              }
          }
        }

        switch (evt.keyCode) {
          case KEY_CODES.SPACE:
          case KEY_CODES.ENTER:
            {
              toggler();
              evt.stopPropagation();
              return evt.preventDefault();
            }
        }
      };
    }

    function makeDropdownFocusOutHandler(data) {
      return debounce(function (evt) {
        var relatedTarget = evt.relatedTarget,
          target = evt.target;
        var menuEl = data.el[0];
        /**
         * Close menu
         * With focusout events, the `relatedTarget` is the element that will next receive focus.
         * @see: https://developer.mozilla.org/en-US/docs/Web/API/FocusEvent/relatedTarget
         */

        var menuContainsFocus = menuEl.contains(relatedTarget) || menuEl.contains(target);

        if (!menuContainsFocus) {
          close(data);
        }

        return evt.stopPropagation();
      });
    } // Export module


    return api;
  });

  /***/
})