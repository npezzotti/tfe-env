data "aws_vpc" "selected" {
  id = var.vpc_id
}

data "aws_subnet" "selected" {
  id = var.subnet_id

  lifecycle {
    postcondition {
      condition     = self.vpc_id == var.vpc_id
      error_message = "Subnet ${var.subnet_id} is not in VPC ${var.vpc_id}."
    }
  }
}

data "aws_key_pair" "main" {
  key_name           = var.key_name
  include_public_key = true
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["888995627335"] # HashiCorp

  filter {
    name   = "name"
    values = ["hc-base-ubuntu-2404-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

data "aws_route53_zone" "selected" {
  name = var.route53_zone_name
}
