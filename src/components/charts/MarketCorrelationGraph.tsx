'use client';

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface Node extends d3.SimulationNodeDatum {
    id: string;
    group: number;
    val: number;
}

interface Link extends d3.SimulationLinkDatum<Node> {
    source: string | Node; // D3 requires links to reference nodes by ID initially
    target: string | Node;
    value: number;
}

// Sample Market Data: Groups represent sectors (1: Tech, 2: Finance, 3: Energy)
const graphData = {
    nodes: [
        { id: "Tech", group: 1, val: 20 },
        { id: "AAPL", group: 1, val: 10 },
        { id: "GOOGL", group: 1, val: 10 },
        { id: "MSFT", group: 1, val: 10 },
        { id: "Finance", group: 2, val: 20 },
        { id: "JPM", group: 2, val: 8 },
        { id: "BAC", group: 2, val: 8 },
        { id: "Energy", group: 3, val: 15 },
        { id: "XOM", group: 3, val: 8 },
        { id: "CVX", group: 3, val: 8 },
        { id: "Market", group: 0, val: 30 }
    ] as Node[],
    links: [
        { source: "Market", target: "Tech", value: 5 },
        { source: "Market", target: "Finance", value: 5 },
        { source: "Market", target: "Energy", value: 3 },
        { source: "Tech", target: "AAPL", value: 2 },
        { source: "Tech", target: "GOOGL", value: 2 },
        { source: "Tech", target: "MSFT", value: 2 },
        { source: "Finance", target: "JPM", value: 2 },
        { source: "Finance", target: "BAC", value: 2 },
        { source: "Energy", target: "XOM", value: 2 },
        { source: "Energy", target: "CVX", value: 2 },
        { source: "AAPL", target: "MSFT", value: 1 }, // Correlation
        { source: "JPM", target: "BAC", value: 1 }
    ] as Link[]
};

export function MarketCorrelationGraph() {
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (!svgRef.current) return;

        // Clear previous render
        d3.select(svgRef.current).selectAll("*").remove();

        const width = 600;
        const height = 400;

        const svg = d3.select(svgRef.current)
            .attr("viewBox", [0, 0, width, height])
            .attr("style", "max-width: 100%; height: auto;");

        const color = d3.scaleOrdinal(d3.schemeCategory10);

        const simulation = d3.forceSimulation(graphData.nodes)
            .force("link", d3.forceLink<Node, Link>(graphData.links).id(d => d.id).distance(50))
            .force("charge", d3.forceManyBody().strength(-200)) // Repel force
            .force("center", d3.forceCenter(width / 2, height / 2));

        const link = svg.append("g")
            .attr("stroke", "#999")
            .attr("stroke-opacity", 0.6)
            .selectAll("line")
            .data(graphData.links)
            .join("line")
            .attr("stroke-width", d => Math.sqrt(d.value));

        const node = svg.append("g")
            .attr("stroke", "#fff")
            .attr("stroke-width", 1.5)
            .selectAll("circle")
            .data(graphData.nodes)
            .join("circle")
            .attr("r", d => d.val) // Radius based on value
            .attr("fill", d => color(String(d.group)))
            .call(d3.drag<SVGCircleElement, Node>() // Interactive drag
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));

        node.append("title")
            .text(d => d.id);

        // Labels
        const labels = svg.append("g")
            .selectAll("text")
            .data(graphData.nodes)
            .enter()
            .append("text")
            .text(d => d.id)
            .attr("font-size", "10px")
            .attr("fill", "#fff")
            .attr("dx", 12)
            .attr("dy", 4);

        simulation.on("tick", () => {
            link
                .attr("x1", d => (d.source as Node).x!)
                .attr("y1", d => (d.source as Node).y!)
                .attr("x2", d => (d.target as Node).x!)
                .attr("y2", d => (d.target as Node).y!);

            node
                .attr("cx", d => d.x!)
                .attr("cy", d => d.y!);

            labels
                .attr("x", d => d.x!)
                .attr("y", d => d.y!);
        });

        function dragstarted(event: any) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
        }

        function dragged(event: any) {
            event.subject.fx = event.x;
            event.subject.fy = event.y;
        }

        function dragended(event: any) {
            if (!event.active) simulation.alphaTarget(0);
            event.subject.fx = null;
            event.subject.fy = null;
        }

        return () => {
            simulation.stop();
        };
    }, []);

    return (
        <div className="w-full h-full bg-[#1a1a2e] rounded-xl overflow-hidden border border-white/10">
            <svg ref={svgRef} className="w-full h-full" />
        </div>
    );
}
