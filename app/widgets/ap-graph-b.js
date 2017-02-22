(function(angular) {
  'use strict';

  angular.module('widgets')

  .component('apGraphB', {
    restrict: 'E',
    replace: true,
    templateUrl: 'widgets/ap-graph-b-tpl.html',
    bindings: {
      data: '<'
    },
    controller: ['$element', '$interpolate', '$timeout', '$scope', ApGraphBController]
  })
  .filter('channelToReadable', function() {
    return function(channel) {
      return ({ '2ghz': '2 GHz', '5ghz': '5 GHz' })[channel];
    };
  })
  .filter('symptomToReadable', function() {
    return function(symptom) {
      return symptom == "" ? "All Symptoms" : symptom;
    };
  });

  var nodeTemplate =
  "\
  <table>\
    <tbody>\
      <tr>\
        <td>AP Name</td>\
        <td>{{ d.attrs.apName }}</td>\
      </tr>\
      <tr>\
        <td>Ap Group</td>\
        <td>{{ d.attrs.apGroup }}</td>\
      </tr>\
      <tr>\
        <td>Affected Client-Hours</td>\
        <td>{{ d.attrs.clientHours }}</td>\
      </tr>\
      <tr>\
        <td>Num Clients</td>\
        <td>{{ d.attrs.numDevices }}</td>\
      </tr>\
    </tbody>\
  </table>\
  ";

  var linkTemplate =
  "\
  <table>\
    <tbody>\
      <tr>\
        <td>Node 1</td>\
        <td>{{ d.source.attrs.apName }}</td>\
      </tr>\
      <tr>\
        <td>Node 2</td>\
        <td>{{ d.target.attrs.apName }}</td>\
      </tr>\
      <tr>\
        <td>SNR dB</td>\
        <td>{{ d.attrs.snrDb }}</td>\
      </tr>\
    </tbody>\
  </table>\
  ";

  var groupLinkTemplate =
  "\
  <table>\
    <tbody>\
      <tr>\
        <td>Group 1</td>\
        <td>{{ d.source.key }}</td>\
      </tr>\
      <tr>\
        <td>Group 2</td>\
        <td>{{ d.target.key }}</td>\
      </tr>\
      <tr>\
        <td>Interfering APs</td>\
        <td>{{ d.numEdges }}</td>\
      </tr>\
    </tbody>\
  </table>\
  ";

  function ApGraphBController($element, $interpolate, $timeout, $scope) {
    var $ctrl = this;
    var svg, width, height, graph, nested, savedNested,
        gRect, gContainer, gLinks, gGroupLinks, gGroups,
        simulation, maxSymptomFilter;

    var color = d3.scale.category20();
    var numDevicesRadius = d3.scale.sqrt()
      .domain([0, 35])
      .range([1, 20]);
    var clientHoursRadius;

    var edgeDistance = d3.scale.linear()
      .domain([0, 30])
      .range([30, 10]);

    var edgeColor = d3.scale.linear()
      .domain([50, 0])
      .range(['red', 'blue'])
      .interpolate(d3.interpolateHcl);

    var tooltip = d3.tip()
      .attr('class', 'd3-tip')
      .offset([-10, 0])
      .html(function(d) {
        var tooltipHtml;
        if (d.source && d.target) {
          if (d.numEdges) {
            tooltipHtml = $interpolate(groupLinkTemplate)({ d: d });
          } else {
            tooltipHtml = $interpolate(linkTemplate)({ d: d });
          }
        } else {
          tooltipHtml = $interpolate(nodeTemplate)({ d: d });
        }
        return tooltipHtml;
      });

    $scope.$on('tabChanged', function(event, tabIndex) {
      if (tabIndex == 1) {
        $timeout(redraw);
      }
    });

    $ctrl.$onInit = function() {
      svg = d3.select($element.find('svg')[0]);

      gRect = svg.append('rect')
        .style('fill', 'none')
        .style('pointer-events', 'all')
        .call(d3.behavior.zoom()
          .scaleExtent([1 / 2, 2])
          .on('zoom', zoomed));

      gContainer = svg.append('g')
        .call(tooltip);

      gGroupLinks = gContainer.append('g')
        .attr('class', 'group-links');
      gGroups = gContainer.append('g')
        .attr('class', 'groups');
      gLinks = gContainer.append('g')
        .attr('class', 'links');

      simulation = d3.layout.force()
        .charge(-500)
        .gravity(0.1)
        .friction(0.6)
        .linkDistance(function(d) {
          return d.source.groupRadius + d.target.groupRadius + edgeDistance(d.numEdges);
        })
        .on('tick', ticked);

      d3.select(window).on('resize', redraw);
    }

    // on data changes
    $ctrl.$onChanges = function() {
      if ($ctrl.data) {
        if (!svg) {
          // let the init code run first
          return $timeout($ctrl.$onChanges);
        }

        graph = JSON.parse(JSON.stringify($ctrl.data));

        // first, populate symptom filters from the client hours data
        $ctrl.symptomFilters = _.chain(graph.clientHours)
          .mapObject(function(symptomDistribs, channel) {
            return _.chain(symptomDistribs)
              .mapObject(function(uuidHours, symptom) {
                var symptomTotalHours = _.chain(uuidHours)
                  .values()
                  .reduce(function(m, n) { return m + n; }, 0)
                  .value();

                return { channel: channel, symptom: symptom, totalHours: symptomTotalHours };
              })
              .values()
              .value();
          })
          .values()
          .flatten()
          .value();

        maxSymptomFilter = $ctrl.symptomFilter = _.max($ctrl.symptomFilters, function(opt) {
          return opt.totalHours;
        });

        // second, setup the static topology edges
        // these edges won't change based on symptom filter, but some may be hidden
        _.each(graph.edges, function(e) {
          e.id = e.source + '_' + e.target;
          e.source = _.find(graph.vertices, function(v) { return v.id == e.source; });
          e.target = _.find(graph.vertices, function(v) { return v.id == e.target; });
        });

        // third, prepare the node data with the symptom filter applied
        filterSymptom();
        filterEdges();
        redraw();
        simulation.start();
      }
    }

    $ctrl.symptomFilterSelected = function(filter) {
      $ctrl.symptomFilter = filter;

      filterSymptom();
      filterEdges();
      redraw();
      simulation.start();
    }

    function filterSymptom() {
      var clientHoursDistrib = graph.clientHours[$ctrl.symptomFilter.channel][$ctrl.symptomFilter.symptom] || {};

      // filter vertices based on client hours data
      // XXX filter with side effects
      graph.filteredVertices = _.filter(graph.vertices, function(v) {
        v.attrs.clientHours = clientHoursDistrib[v.id] || undefined;
        return v.attrs.clientHours > 0;
      });

      // set-up radius scale
      clientHoursRadius = d3.scale.sqrt()
        .domain(d3.extent(graph.filteredVertices, function(d) { return d.attrs.clientHours; }))
        .range([3, 30]);

      // populate the nested (grouped nodes) structure
      nested = d3.nest()
        .key(function(d) { return d.attrs.apGroup; })
        .entries(graph.filteredVertices);

      // populate extra attributes for the group nodes so they look normalized
      _.each(nested, function(group) {
        var sumDevices = _.chain(group.values)
          .map(function(d) { return d.attrs.numDevices; })
          .reduce(function(m, n) { return m + n; }, 0)
          .value();

        var sumHours = _.chain(group.values)
          .map(function(d) { return d.attrs.clientHours; })
          .reduce(function(m, n) { return m + n; }, 0)
          .value();

        group.id = group.key;
        group.attrs = {
          numDevices: sumDevices,
          clientHours: sumHours,
          apGroup: group.key
        };
      });

      // derive the group edges after symptom filter is applied on nodes
      graph.groupEdges = _.chain(graph.edges)
        .map(function(e) {
          // for d3 force layout
          var sourceIndex = _.findIndex(nested, function(group) { return e.source.attrs.apGroup == group.key; }),
              targetIndex = _.findIndex(nested, function(group) { return e.target.attrs.apGroup == group.key; });

          var indexes = [sourceIndex, targetIndex].sort(),
              id = indexes[0] + '_' + indexes[1];

          // un-directed edges
          return { id: id, source: indexes[0], target: indexes[1] };
        })
        .filter(function(e) { return e.source >= 0 && e.target >= 0 && e.source != e.target; })
        .groupBy('id')
        .mapObject(function(bundle, id) {
          return { id: id, source: bundle[0].source, target: bundle[0].target, numEdges: bundle.length };
        })
        .values()
        .value();

      // pre-compute pack layout for nodes in each group
      _.each(nested, function(group) {
        group.groupRadius = clientHoursRadius(group.attrs.clientHours);

        d3.layout.pack()
          .sort(null)
          .size([group.groupRadius * 2, group.groupRadius * 2])
          .children(function(d) { return d.values; })
          .value(function(d) { return d.attrs.clientHours; })
          // .nodes(_.pick(group, 'values', 'groupRadius'))
          .nodes(group)
          ;
      });

      // reload the x, y positions of old group nodes to minimize force layout movement
      _.each(savedNested, function(oldGroup) {
        var group = _.find(nested, function(g) { return g.key == oldGroup.key; });
        if (group) {
          group.x = oldGroup.x;
          group.y = oldGroup.y;
        }
      });
    }

    function redraw() {
      var clientRect = svg.node().getBoundingClientRect();
      width = clientRect.width;
      height = clientRect.height;

      if (!graph) {
        return;
      }
      Math.seedrandom('ap-graph-b-seed');

      gRect
        .attr('width', width)
        .attr('height', height);

      gGroups.call(groups, nested);
      gGroupLinks.call(groupLinks, graph.groupEdges);
      gLinks.call(links, graph.filteredEdges);

      simulation
        .size([width, height])
        .nodes(nested)
        .links(graph.groupEdges)
        // .start()
        ;
    }

    function groups(g, groups) {
      var tran = d3.transition()
        .duration(2000);

      var gGroups = g.selectAll('g')
        .data(groups, function(group) { return group.key; });
      gGroups.enter().append('g')
        .on('click', groupClicked)
        .call(simulation.drag)
        .append('circle')
          .attr('class', 'group-node');
      gGroups
        .attr('class', function(d) { return 'nodes' + (d.faded ? ' faded' : ''); });
      gGroups.exit().transition(tran).remove();

      var gGroupNodes = gGroups.select('circle.group-node');
      gGroupNodes
        .transition(tran)
        .attr('r', function(d) { return d.groupRadius; });

      var gCircles = gGroups.selectAll('circle.node')
        .data(function(group) { return group.values; }, function(d) { return d.id; });
      gCircles.enter().append('circle')
        .attr('class', 'node')
        .on('mouseover', tooltip.show)
        .on('mouseout', tooltip.hide)
        .append('title')
          .text(function(d) { return d.attrs.apName; });
      gCircles
        .attr('fill', function(d) { return color(d.attrs.apGroup); })
        .transition(tran)
        .attr('cx', function(d) { return d.x - d.parent.groupRadius; })
        .attr('cy', function(d) { return d.y - d.parent.groupRadius; })
        .attr('r', function(d) { return d.r; })
        ;
      gCircles.exit().transition(tran).remove();
    }

    function links(g, edges) {
      var gLines = g.selectAll('line').data(edges, function(d) { return d.id; });
      gLines.enter().append('line')
        .on('mouseover', tooltip.show)
        .on('mouseout', tooltip.hide);
      gLines
        .attr('x1', function(d) { return d.source.parent.x + d.source.x - d.source.parent.groupRadius; })
        .attr('y1', function(d) { return d.source.parent.y + d.source.y - d.source.parent.groupRadius; })
        .attr('x2', function(d) { return d.target.parent.x + d.target.x - d.target.parent.groupRadius; })
        .attr('y2', function(d) { return d.target.parent.y + d.target.y - d.target.parent.groupRadius; });
      gLines.exit().remove();
    }

    function groupLinks(g, edges) {
      var gLines = g.selectAll('line').data(edges, function(d) { return d.id; });
      gLines.enter().append('line')
        .on('mouseover', tooltip.show)
        .on('mouseout', tooltip.hide);
      gLines
        .attr('stroke-width', function(d) { return Math.sqrt(d.numEdges); })
        .attr('class', function(d) {
          return (d.source.faded || d.target.faded) ? 'faded' : '';
        })
        // .attr('x1', function(d) { return d.source.x; })
        // .attr('y1', function(d) { return d.source.y; })
        // .attr('x2', function(d) { return d.target.x; })
        // .attr('y2', function(d) { return d.target.y; })
        ;
      gLines.exit().remove();
    }

    function filterEdges(selectedGroup) {
      if (selectedGroup) {
        graph.filteredEdges = _.filter(graph.edges, function(e) {
          return _.contains(graph.filteredVertices, e.source)
            && _.contains(graph.filteredVertices, e.target)
            && (e.source.parent == selectedGroup || e.target.parent == selectedGroup);
        });
      } else {
        graph.filteredEdges = [];
      }
    }

    function groupClicked(clickedGroup) {
      if (d3.event.defaultPrevented) {
        return; // dragged
      }

      clickedGroup.selected = !clickedGroup.selected;
      _.each(nested, function(group) {
        if (group != clickedGroup) {
          group.selected = false;
          group.faded = clickedGroup.selected;
        }
      });

      filterEdges(clickedGroup.selected ? clickedGroup : undefined);
      _.chain(graph.filteredEdges)
        .map(function(e) { return [ e.source.parent, e.target.parent ]; })
        .flatten()
        .each(function(group) {
          group.faded = false;
        });

      redraw();
    }

    function ticked() {
      gGroups.selectAll('g')
        .attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; });

      gGroupLinks.selectAll('line')
        .attr('x1', function(d) { return d.source.x; })
        .attr('y1', function(d) { return d.source.y; })
        .attr('x2', function(d) { return d.target.x; })
        .attr('y2', function(d) { return d.target.y; });

      gLinks.selectAll('line')
        .attr('x1', function(d) { return d.source.parent.x + d.source.x - d.source.parent.groupRadius; })
        .attr('y1', function(d) { return d.source.parent.y + d.source.y - d.source.parent.groupRadius; })
        .attr('x2', function(d) { return d.target.parent.x + d.target.x - d.target.parent.groupRadius; })
        .attr('y2', function(d) { return d.target.parent.y + d.target.y - d.target.parent.groupRadius; });

      if ($ctrl.symptomFilter == maxSymptomFilter) {
        savedNested = nested;
      }
    }

    function zoomed() {
      gContainer.attr('transform', 'translate(' + d3.event.translate + ')scale(' + d3.event.scale + ')');
    }
  }
})(window.angular);
