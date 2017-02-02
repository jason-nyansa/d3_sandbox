'use strict';

angular.module('widgets', [])

.component('apGraph', {
  restrict: 'E',
  replace: true,
  templateUrl: 'widgets/ap-graph-tpl.html',
  bindings: {
    data: '<'
  },
  controller: ['$element', ApGraphController]
})

function ApGraphController($element) {
  var $ctrl = this;
  var svg, width, height, graph, gRect, gContainer, gLinks, gNodes, simulation;

  var color = d3.scale.category20();
  var radius = d3.scale.sqrt()
    .domain([0, 100])
    .range([1, 20]);

  $ctrl.$onInit = function() {
    svg = d3.select($element.find('svg')[0]);

    gRect = svg.append('rect')
      .style('fill', 'none')
      .style('pointer-events', 'all')
      .call(d3.behavior.zoom()
        .scaleExtent([1 / 2, 2])
        .on('zoom', zoomed));

    gContainer = svg.append('g');

    gLinks = gContainer.append('g')
      .attr('class', 'links');
    gNodes = gContainer.append('g')
      .attr('class', 'nodes');

    simulation = d3.layout.force()
      .gravity(0.05)
      .distance(50)
      .charge(-100)
      .on('tick', ticked);

    d3.select(window).on('resize', redraw);
  }

  $ctrl.$onChanges = function() {
    if ($ctrl.data) {
      graph = $ctrl.data;

      graph.vertices = _.filter(graph.vertices, function(v) {
        return v.attrs.numDevices > 6;
      });

      var ids = new Set(_.pluck(graph.vertices, 'id'));
      graph.edges = _.filter(graph.edges, function(e) {
        return ids.has(e.source) && ids.has(e.target);
      });

      _.each(graph.edges, function(e) {
        e.source = _.findIndex(graph.vertices, function(v) { return v.id == e.source; });
        e.target = _.findIndex(graph.vertices, function(v) { return v.id == e.target; });
      });

      redraw();
      simulation.start();
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

    gLinks.call(links, graph);
    gNodes.call(nodes, graph);

    simulation
      .size([width, height])
      .nodes(graph.vertices)
      .links(graph.edges);
  }

  function links(g, graph) {
    var gLines = g.selectAll('line').data(graph.edges);
    gLines.enter().append('line');
      // .attr('stroke-width', function(d) { return Math.sqrt(d.attrs.snrDb); });
    gLines.exit().remove();
  }

  function nodes(g, graph) {
    var gCircles = g.selectAll('circle').data(graph.vertices, function(d) { return d.id; });
    gCircles.enter().append('circle')
      .call(simulation.drag)
      .append('title')
        .text(function(d) { return d.attrs.apName; });
    gCircles
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
      .attr('cx', function(d) { return d.x; })  // = Math.max(5, Math.min(width - 5, d.x)); })
      .attr('cy', function(d) { return d.y; }); // = Math.max(5, Math.min(height - 5, d.y)); });
  }

  function zoomed() {
    gContainer.attr('transform', 'translate(' + d3.event.translate + ')scale(' + d3.event.scale + ')');
  }
}

;
