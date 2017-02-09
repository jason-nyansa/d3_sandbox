'use strict';

angular.module('widgets')

.component('apHierarchyGraph', {
  restrict: 'E',
  replace: true,
  templateUrl: 'widgets/ap-hierarchy-graph-tpl.html',
  bindings: {
    data: '<'
  },
  controller: ['$element', '$interpolate', '$timeout', '$scope', ApHierarchyGraphController]
});

var nodeTemplate =
"\
<table>\
  <tbody>\
    <tr>\
      <td>Name</td>\
      <td>{{ d.id }}</td>\
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

function ApHierarchyGraphController($element, $interpolate, $timeout, $scope) {
  var $ctrl = this;
  var svg, width, height, graph, gRect, gContainer, gLinks, gNodes, simulation;

  var color = d3.scale.category20();
  var radius = d3.scale.sqrt()
    .domain([0, 100])
    .range([1, 20]);

  var edgeDistance = d3.scale.linear()
    .domain([0, 100])
    .range([50, 150]);

  var tooltip = d3.tip()
    .attr('class', 'd3-tip')
    .offset([-10, 0])
    .html(function(d) {
      return $interpolate(nodeTemplate)({ d: d });
    });

  $scope.$on('tabChanged', function(event, tabIndex) {
    if (tabIndex == 2) {
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
    gNodes = gContainer.append('g')
      .attr('class', 'nodes');

    simulation = d3.layout.force()
      .gravity(0.05)
      .linkDistance(function(d) { return edgeDistance(d.target.attrs.numDevices); })
      // .distance(50)
      .charge(-100)
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

      var apGroupVertices = _.chain(graph.vertices)
        .groupBy(function(v) {
          return v.attrs.apGroup;
        })
        .mapObject(function(vs, apGroup) {
          var sumDevices = _.chain(vs)
            .map(function(v) { return v.attrs.numDevices; })
            .reduce(function(m, n) { return m + n; }, 0)
            .value();

          // create super-node by apGroup
          return {
            id: apGroup,
            _children: vs,
            attrs: {
              apGroup: apGroup,
              numDevices: sumDevices
            }
          };
        })
        .values()
        .value();

      var rootVertice = {
        id: "Brandeis",
        children: apGroupVertices,
        attrs: {
          apGroups: "",
          numDevices: 1
        },
        fixed: true
      };

      graph.vertices = graph.vertices.concat(apGroupVertices);
      graph.vertices.push(rootVertice);
      graph.root = rootVertice;

      redraw();
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

    graph.root.x = width / 2;
    graph.root.y = height / 2;

    var visibleVertices = flatten(graph.root),
        visibleEdges = d3.layout.tree().links(visibleVertices);

    gLinks.call(links, visibleEdges);
    gNodes.call(nodes, visibleVertices);

    simulation
      .size([width, height])
      .nodes(visibleVertices)
      .links(visibleEdges)
      .start();
  }

  function links(g, edges) {
    var gLines = g.selectAll('line.link')
      .data(edges, function(d) { return d.target.id; });
    gLines.enter().append('line')
      .attr('class', 'link');
    gLines
      .attr('x1', function(d) { return d.source.x; })
      .attr('y1', function(d) { return d.source.y; })
      .attr('x2', function(d) { return d.target.x; })
      .attr('y2', function(d) { return d.target.y; });
    gLines.exit().remove();
  }

  function nodes(g, vertices) {
    var gCircles = g.selectAll('circle.node')
      .data(vertices, function(d) { return d.id; });
    gCircles.enter().append('circle')
      .attr('class', 'node')
      .on('click', clicked)
      .call(simulation.drag)
      .on('mouseover', tooltip.show)
      .on('mouseout', tooltip.hide)
      .attr('px', function(d) { return d.parent ? d.parent.x : (width / 2); })
      .attr('py', function(d) { return d.parent ? d.parent.y : (height / 2); })
      .append('title')
        .text(function(d) { return d.id; });
    gCircles
      .attr('cx', function(d) { return d.x; })
      .attr('cy', function(d) { return d.y; })
      .attr('r', function(d) { return radius(d.attrs.numDevices); })
      .attr('fill', function(d) { return color(d.attrs.apGroup); });
    gCircles.exit().remove();
  }

  function ticked() {
    gLinks.selectAll('line')
      .attr('x1', function(d) { return d.source.x; })
      .attr('y1', function(d) { return d.source.y; })
      .attr('x2', function(d) { return d.target.x; })
      .attr('y2', function(d) { return d.target.y; });

    gNodes.selectAll('circle')
      .attr('cx', function(d) { return d.x; })
      .attr('cy', function(d) { return d.y; });
  }

  function clicked(d) {
    if (d != graph.root) {
      var dChildren = d.children;
      d.children = d._children;
      d._children = dChildren;

      redraw();
    }
  }

  function zoomed() {
    gContainer.attr('transform', 'translate(' + d3.event.translate + ')scale(' + d3.event.scale + ')');
  }

  function flatten(root) {
    if (root) {
      var children = _.chain(root.children).map(flatten).flatten().value();
      return [ root ].concat( children );
    } else {
      return [];
    }
  }
}
