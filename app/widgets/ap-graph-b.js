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
        <td>Bundled Edges</td>\
        <td>{{ d.numEdges }}</td>\
      </tr>\
    </tbody>\
  </table>\
  ";

  function ApGraphBController($element, $interpolate, $timeout, $scope) {
    var $ctrl = this;
    var svg, width, height, graph, nested,
        gRect, gContainer, gLinks, gGroupLinks, gGroups,
        simulation;

    var color = d3.scale.category20();
    var radius = d3.scale.sqrt()
      .domain([0, 100])
      .range([1, 20]);

    var edgeDistance = d3.scale.linear()
      .domain([0, 30])
      .range([150, 10]);

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

      gLinks = gContainer.append('g')
        .attr('class', 'links');
      gGroupLinks = gContainer.append('g')
        .attr('class', 'group-links');
      gGroups = gContainer.append('g')
        .attr('class', 'groups');

      simulation = d3.layout.force()
        .charge(-100)
        .linkDistance(function(d) { return edgeDistance(d.numEdges); })
        .on('tick', ticked);

      d3.select(window).on('resize', redraw);
    }

    $ctrl.$onChanges = function() {
      if ($ctrl.data) {
        if (!svg) {
          // let the init code run first
          return $timeout($ctrl.$onChanges);
        }

        graph = JSON.parse(JSON.stringify($ctrl.data));

        // prep for D3 force layout
        _.each(graph.edges, function(e) {
          // e.source = _.findIndex(graph.vertices, function(v) { return v.id == e.source; });
          // e.target = _.findIndex(graph.vertices, function(v) { return v.id == e.target; });
          e.source = _.find(graph.vertices, function(v) { return v.id == e.source; });
          e.target = _.find(graph.vertices, function(v) { return v.id == e.target; });
        });

        nested = d3.nest()
          .key(function(d) { return d.attrs.apGroup; })
          .entries(graph.vertices);

        _.each(nested, function(group) {
          var sumDevices = _.chain(group.values)
            .map(function(d) { return d.attrs.numDevices; })
            .reduce(function(m, n) { return m + n; }, 0)
            .value();

          group.id = group.key;
          group.attrs = {
            numDevices: sumDevices,
            apGroup: group.key
          };
        });

        graph.groupEdges = _.chain(graph.edges)
          .map(function(e) {
            var sourceIndex = _.findIndex(nested, function(group) { return e.source.attrs.apGroup == group.key; }),
                targetIndex = _.findIndex(nested, function(group) { return e.target.attrs.apGroup == group.key; });

            var indexes = [sourceIndex, targetIndex].sort(),
                id = indexes[0] + '_' + indexes[1];

            // un-directed edges
            return { id: id, source: indexes[0], target: indexes[1] };
          })
          .filter(function(e) { return e.source != e.target; })
          .groupBy('id')
          .mapObject(function(bundle, id) {
            return { id: id, source: bundle[0].source, target: bundle[0].target, numEdges: bundle.length };
          })
          .values()
          .value();

        redraw();
        // simulation.start();
      }
    }

    function redraw() {
      var clientRect = svg.node().getBoundingClientRect();
      width = clientRect.width;
      height = clientRect.height;

      if (!graph) {
        return;
      }

      gRect
        .attr('width', width)
        .attr('height', height);

      d3.layout.pack()
        .sort(null)
        .size([width, height])
        .children(function(d) { return d.values; })
        .value(function(d) { return d.attrs.numDevices; })
        .nodes({ values: nested });

      simulation
        .size([width, height])
        .nodes(nested)
        .links(graph.groupEdges)
        .start()
        .stop();

      gGroups.call(groups, nested);
      gGroupLinks.call(groupLinks, graph);
      gLinks.call(links, graph);
    }

    function groups(g, groups) {
      var gGroups = g.selectAll('g')
        .data(groups, function(group) { return group.key; });
      gGroups.enter().append('g')
        .append('circle')
          .attr('class', 'nodes-group')
          .call(simulation.drag)
          .attr('fill', 'green')
          .attr('r', function(d) { return radius(d.attrs.numDevices * 2); })
          .attr('opacity', 0.5)
          .attr('cx', function(d) { return d.x; })
          .attr('cy', function(d) { return d.y; });
      gGroups
        .attr('opacity', 0.7);

      var gCircles = gGroups.selectAll('circle.node')
        .data(function(group) { return group.values; }, function(d) { return d.id; });
      gCircles.enter().append('circle')
        .attr('class', 'node')
        .on('mouseover', tooltip.show)
        .on('mouseout', tooltip.hide)
        .append('title')
          .text(function(d) { return d.attrs.apName; });
      gCircles
        .attr('r', function(d) { return radius(d.attrs.numDevices); })
        .attr('fill', function(d) { return color(d.attrs.apGroup); })
        .attr('cx', function(d) { return d.x; })
        .attr('cy', function(d) { return d.y; });
      gCircles.exit().remove();

      gGroups.exit().remove();
    }

    function links(g, graph) {
      var gLines = g.selectAll('line').data(graph.edges);
      gLines.enter().append('line')
        .on('mouseover', tooltip.show)
        .on('mouseout', tooltip.hide);
      gLines
        .attr('x1', function(d) { return d.source.x; })
        .attr('y1', function(d) { return d.source.y; })
        .attr('x2', function(d) { return d.target.x; })
        .attr('y2', function(d) { return d.target.y; });
      gLines.exit().remove();
    }

    function groupLinks(g, graph) {
      var gLines = g.selectAll('line').data(graph.groupEdges, function(d) { return d.id; });
      gLines.enter().append('line')
        .on('mouseover', tooltip.show)
        .on('mouseout', tooltip.hide);
      gLines
        .attr('stroke-width', function(d) { return Math.sqrt(d.numEdges); })
        .attr('x1', function(d) { return d.source.x; })
        .attr('y1', function(d) { return d.source.y; })
        .attr('x2', function(d) { return d.target.x; })
        .attr('y2', function(d) { return d.target.y; });
      gLines.exit().remove();
    }

    function ticked() {
      gGroups.selectAll('g')
        .attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; })
        // .selectAll('circle.nodes-group')
        //   .attr('cx', function(d) { return d.x; })
        //   .attr('cy', function(d) { return d.y; });

      gGroups.selectAll('g')
        .selectAll('circle.node')
          .attr('cx', function(d) { return d.x; })
          .attr('cy', function(d) { return d.y; });

      gGroupLinks.selectAll('line')
        .attr('x1', function(d) { return d.source.x; })
        .attr('y1', function(d) { return d.source.y; })
        .attr('x2', function(d) { return d.target.x; })
        .attr('y2', function(d) { return d.target.y; });

      gLinks.selectAll('line')
        .attr('x1', function(d) { return d.source.parent.x + d.source.x; })
        .attr('y1', function(d) { return d.source.parent.y + d.source.y; })
        .attr('x2', function(d) { return d.target.parent.x + d.target.x; })
        .attr('y2', function(d) { return d.target.parent.y + d.target.y; });
    }

    function zoomed() {
      gContainer.attr('transform', 'translate(' + d3.event.translate + ')scale(' + d3.event.scale + ')');
    }
  }
})(window.angular);
