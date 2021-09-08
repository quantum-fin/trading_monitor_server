#!/bin/bash

INPUT_FILE="./input.csv";
OUTPUT_FILE="./output.csv";

for FILE in ${INPUT_FILE} ${OUTPUT_FILE}
do
  rm ${FILE};
  touch ${FILE};
done;

node app.js